/*******************************************************************************
 * Licensed Materials - Property of IBM
 * (c) Copyright IBM Corporation 2018. All Rights Reserved.
 *
 * Note to U.S. Government Users Restricted Rights:
 * Use, duplication or disclosure restricted by GSA ADP Schedule
 * Contract with IBM Corp.
 *******************************************************************************/
'use strict'

import cytoscape from 'cytoscape'
import cycola from 'cytoscape-cola'
import dagre from 'cytoscape-dagre'
import {getWrappedNodeLabel} from './nodeHelper'
import {layoutEdges, setDraggedLineData} from './linkHelper'
import _ from 'lodash'
cytoscape.use( cycola )
cytoscape.use( dagre )

import { NODE_SIZE } from './constants.js'

export default class LayoutHelper {
  /**
   * Helper class to be used by TopologyDiagram.
   */

  constructor (staticResourceData, titles, locale) {
    Object.assign(this, staticResourceData)
    this.titles = titles
    this.locale = locale
    this.nodeClones = {}
    this.cachedAdapters = {}
    this.cachedLayouts = {}
    this.selfLinks = {}
    this.destroyed = false
  }

  destroy = () => {
    this.destroyed = true
  }

  layout = (nodes, links, hiddenLinks, options, cb) => {
    Object.assign(this, options)

    // sort out nodes that can appear everywhere
    this.nodesToBeCloned = {}
    this.clonedIdSet = new Set()
    if (this.topologyCloneTypes) {
      nodes = nodes.filter(n=>{
        if (this.topologyCloneTypes.indexOf(n.type) !== -1) {
          this.nodesToBeCloned[n.uid] = n
          this.clonedIdSet.add(n.uid)
          return false
        }
        return true
      })
    }

    // for each cluster, group into collections by type
    const groups = this.getNodeGroups(nodes)

    // group by connections which may pull nodes into other groups
    this.groupNodesByConnections(groups, links)

    // consolidate connected groups which are just a single node connected to clones
    this.consolidateNodes(groups, nodes)

    // re-add cloned nodes
    this.cloneNodes(groups, nodes)

    //identify hubs
    this.markHubs(groups)

    // assign info to each node
    if (this.topologyNodeLayout) {
      nodes.forEach(node=>{
        this.topologyNodeLayout(node, this.locale)
      })
    }

    // create cytoscape element collections
    let collections = this.createCollections(groups)

    // assign cytoscape layout options for each collection (ex: dagre, grid)
    this.setLayoutOptions(collections)

    // run the cytoscape layouts
    collections = collections.connected.concat(collections.unconnected)
    this.runCollectionLayouts(collections, () => {

      // after all layouts run, use Masonry to fit the collections neatly in the diagram
      const layoutInfo = this.layoutCollections(collections, hiddenLinks)


      // return to TopologyView to create/position the d3 svg shapes
      if (!this.destroyed) {
        cb({laidoutNodes: nodes, ...layoutInfo})
      }
    })
  }

  getNodeGroups = (nodes) => {
    // separate into types
    const groupMap = {}
    const allNodeMap = {}
    const controllerMap = {}
    const controllerSet = new Set(['deployment', 'daemonset', 'statefulset', 'cronjob'])
    nodes.forEach(node=>{
      allNodeMap[node.uid] = node
      let type = controllerSet.has(node.type) ? 'controller' : node.type
      if (this.topologyOrder.indexOf(type)===-1) {
        if (this.topologyOrder.indexOf('unknown')===-1) {
          this.topologyOrder.push('unknown')
        }
        type = 'unknown'
      }
      let group = groupMap[type]
      if (!group) {
        group = groupMap[type] = {nodes:[]}
      }
      const label = (node.name||'').replace(/[0-9a-fA-F]{8,10}-[0-9a-zA-Z]{4,5}$/, '{uid}')
      node.layout = Object.assign(node.layout || {}, {
        uid: node.uid,
        type: node.type,
        label: getWrappedNodeLabel(label,18,3),
        compactLabel: getWrappedNodeLabel(label,12,2)
      })
      delete node.layout.source
      delete node.layout.target
      delete node.layout.selfLink
      if (node.selfLink) {
        node.layout.selfLink = {
          link: node.selfLink,
          nodeLayout: node.layout
        }
      }

      switch (type) {
      case 'controller':
        Object.assign(node.layout, {
          qname: node.namespace+'/'+node.name,
          hasService: false,
          hasPods: false,
          showDot: false,
          pods: [],
          services: []
        })
        controllerMap[node.layout.qname] = node
        break
      case 'pod':
        node.layout.qname = node.namespace+'/'+node.name.replace(/-[0-9a-fA-F]{8,10}-[0-9a-zA-Z]{4,5}$/, '')
        break
      case 'service':
        node.layout.qname = node.namespace+'/'+node.name.replace(/-service$/, '')
        break
      }
      group.nodes.push(node)
    })

    // combine pods into their controllers
    const controllerAsService = []
    if (groupMap['controller']) {
      if (groupMap['pod']) {
        let i=groupMap['pod'].nodes.length
        while(--i>=0) {
          const node = groupMap['pod'].nodes[i]
          if (node.layout) {
            const controller = controllerMap[node.layout.qname]
            if (controller) {
              controller.layout.pods.push(node)
              controller.layout.hasPods = controller.layout.showDot = true
              groupMap['pod'].nodes.splice(i,1)
              delete allNodeMap[node.uid]
              delete node.layout
            }
          }
        }
      }

      if (groupMap['service']) {
        let i=groupMap['service'].nodes.length
        while(--i>=0) {
          const node = groupMap['service'].nodes[i]
          if (!node.layout) {
            const controller = controllerMap[node.layout.qname]
            if (controller) {
              controller.layout.services.push(node)
              groupMap['service'].nodes.splice(i,1)
              controllerAsService.push(node.layout.qname)
              delete allNodeMap[node.uid]
              delete node.layout
            }
          }
        }
      }
    }

    // show controllers as services
    controllerAsService.forEach(qname=>{
      var inx = groupMap['controller'].nodes.findIndex(({layout})=>{
        return layout.qname === qname
      })
      if (inx!==-1) {
        const controller = groupMap['controller'].nodes.splice(inx,1)[0]
        controller.layout.type = 'service'
        controller.layout.hasService = controller.layout.showDot = true
        groupMap['service'].nodes.push(controller)
      }
    })
    return {nodeGroups: groupMap, allNodeMap}
  }

  groupNodesByConnections = (groups, links) => {
    const {nodeGroups, allNodeMap} = groups
    const sourceMap = {}
    const targetMap = {}
    const anyConnectedSet = new Set()
    links
      .filter(link=>{
        return (link.source && link.target &&
            (allNodeMap[link.source] || this.nodesToBeCloned[link.source]) &&
            (allNodeMap[link.target] || this.nodesToBeCloned[link.target] ))
      })
      .forEach(link=>{
        // all sources of this target
        let sources = sourceMap[link.target]
        if (!sources) {
          sources = sourceMap[link.target] = []
        }
        sources.push({source:link.source, link})

        // all targets of this source
        let targets = targetMap[link.source]
        if (!targets) {
          targets = targetMap[link.source] = []
        }
        targets.push({target:link.target, link})

        // anything that's connected
        anyConnectedSet.add(link.source)
        anyConnectedSet.add(link.target)
      })
    const connectedSet = new Set()
    const directions = [
      {map:sourceMap, next:'source', other:'target'},
      {map:targetMap, next:'target', other:'source'}]
    this.topologyOrder.forEach(type=>{
      if (nodeGroups[type]) {
        const group = nodeGroups[type]
        // sort nodes/links into collections
        const connected = nodeGroups[type].connected = []
        const unconnected = nodeGroups[type].unconnected = []

        // find the connected nodes
        group.nodes.forEach(node => {
          const {uid} = node
          // if this node is connected to anything start a new group
          if (!connectedSet.has(uid) && anyConnectedSet.has(uid)) {
            const grp = {
              nodeMap: {},
              edges: []
            }
            connected.push(grp)

            // then add everything connected to this node to this group
            this.gatherNodesByConnections(uid, grp, directions, connectedSet, allNodeMap)

          } else if (!anyConnectedSet.has(uid)) {

            // the rest are unconnected
            unconnected.push(node)
          }
        })
      }
    })

    // remove any groups that are now empty
    Object.keys(nodeGroups).forEach(key=>{
      const {connected, unconnected} = nodeGroups[key]
      if (connected.length===0 && unconnected.length===0) {
        delete nodeGroups[key]
      }
    })

    // add all the edges that belong to connected nodes
    this.topologyOrder.forEach(type=>{
      if (nodeGroups[type]) {
        const {connected} = nodeGroups[type]
        connected.forEach(connect=>{
          const {nodeMap} = connect
          const details = {clusterMap:{}, typeMap:{}}

          // fill edges
          var edgeMap = {}
          for (var uid in nodeMap) {
            directions.forEach(({map, next, other})=>{
              if (map[uid]) {
                map[uid].forEach(entry => {
                  const {link} = entry

                  // add link-- use current layout if still relavent
                  const theNext = this.nodesToBeCloned[link[next]] || allNodeMap[link[next]].layout
                  const theOther = this.nodesToBeCloned[link[other]] || allNodeMap[link[other]].layout
                  if (!link.layout || link[next]!==theNext.uid || link[other]!==theOther.uid) {
                    link.layout = {}
                    link.layout[next] = theNext
                    link.layout[other] = theOther
                  }
                  edgeMap[link.uid] = link

                  // remember clusters
                  this.gatherSectionDetails(allNodeMap, [theNext, theOther], details)
                })
              }
            })
          }
          this.setSectionDetails(connect, details, edgeMap)
        })
      }
    })

  }

  gatherNodesByConnections = (uid, grp, directions, connectedSet, allNodeMap) => {
    // already connected to another group??
    if (!connectedSet.has(uid)) {
      connectedSet.add(uid)

      // add this node to this group
      grp.nodeMap[uid] = allNodeMap[uid]

      // recurse up and down to get everything
      directions.forEach(({map, next})=>{
        if (map[uid]) {
          map[uid].forEach(entry => {
            const {link} = entry
            const end = entry[next]
            if (!connectedSet.has(end)) {
              // reiterate until nothing else connected
              if (!this.nodesToBeCloned[end]) {
                this.gatherNodesByConnections(link[next], grp, directions, connectedSet, allNodeMap)
              }
            }
          })
        }
      })
    }
  }

  markHubs = ({nodeGroups}) => {
    if (this.topologyOptions.showHubs) {
      this.topologyOrder.forEach(type=>{
        if (nodeGroups[type]) {
          const {connected} = nodeGroups[type]
          connected.forEach(c=>{
            this.markHubsHelper(c)
          })
        }
      })
    }
  }

  markHubsHelper = ({nodeMap, details}) => {
    // build list of all the next nodes
    const hubArr = []
    const targets = {}
    const sources = {}
    const keys = Object.keys(nodeMap)
    keys.forEach(id => {
      targets[id] = []
      sources[id] = []
    })
    const {edges} = details
    edges.forEach(({layout: {source:{uid:sid}, target:{uid:tid}}}) =>{
      if (targets[sid]) targets[sid].push(tid)
      if (sources[tid]) sources[tid].push(sid)
    })

    // a hub has 3 or more inputs or 6 ins and outs
    const nodes = Object.keys(targets)
    for (let i=0; i<nodes.length; i++) {
      const id = nodes[i]
      let cnt = sources[id].length
      if (cnt<4) {
        cnt+=targets[id].length
        if (cnt<6) {
          cnt = 0
        }
      }
      if (cnt) {
        hubArr.push({
          cnt,
          nodeId: id
        })
      }
    }

    // sort the largest hubs
    if (hubArr.length>0) {
      hubArr.sort(({cnt:ac}, {cnt:bc}) => {
        return bc - ac
      })
      const majorThreshold = keys.length < 15 ? 2 : 3
      hubArr.forEach(({nodeId}, inx) => {
        const {layout} = nodeMap[nodeId]
        if (inx<majorThreshold) {
          layout.isMajorHub = true
        } else {
          layout.isMajorHub = false
          layout.isMinorHub = true
        }
      })
    }
  }

  consolidateNodes = (groups) => {
    const {nodeGroups, allNodeMap} = groups

    // consolidate single nodes that just connect to clones
    const directions = [
      {next:'source', other:'target'},
      {next:'target', other:'source'}]
    this.topologyOrder.forEach(type=>{
      if (nodeGroups[type] && nodeGroups[type].connected) {
        // possibly create new consolidated connected groups
        const newConsolidatedGroups={}

        nodeGroups[type].connected = nodeGroups[type].connected.filter(({nodeMap, details: {edges}})=>{
          // if single node cannot be in connected group unless it ONLY connects to clones
          if (Object.keys(nodeMap).length===1) {
            for (var i = 0; i < edges.length; i++) {
              const edge = edges[i]
              directions.forEach(({next, other})=>{
                this.consolidateNodesHelper(newConsolidatedGroups, allNodeMap, nodeMap, edge, next, other)
              })
            }
            return false
          } else {
            return true
          }
        })
        // if not empty, add the new consolidated groups to this nodeGroup
        this.readdConsolidateNodes(nodeGroups[type].connected, newConsolidatedGroups)
      }
    })
  }

  consolidateNodesHelper = (newGroups, allNodeMap, nodeMap, edge, next, other) => {
    const cloneNode = this.nodesToBeCloned[edge[next]]
    if (cloneNode) {
      // each cluster/clone type (ex: host)/ type (ex: controller) gets its own connected group
      const nodeId = edge[other]
      const {clusterName, type} = allNodeMap[nodeId]
      const key = `${next}/${clusterName}/${cloneNode.type}`
      let group = newGroups[key]
      if (!group) {
        group = newGroups[key] = {nodeMap:{}, edges:[], clusterName, typeMap:{}}
      }
      group.edges.push(edge)
      group.typeMap[cloneNode.type] = true
      group.typeMap[type] = true
      group.nodeMap = Object.assign(group.nodeMap, nodeMap)
      group.uid = group.uid || nodeId
    }
  }

  readdConsolidateNodes = (connected, newGroups) => {
    for (const key in newGroups) {
      const {nodeMap, edges, clusterName, typeMap} = newGroups[key]
      const clusters = [clusterName]
      const types = Object.keys(typeMap).sort()
      connected.unshift({
        nodeMap,
        details: {
          edges,
          clusters: clusters.join('/'),
          title: this.getSectionTitle(clusters, types)
        }
      })
    }
  }

  cloneNodes = (groups, nodes) => {
    const {nodeGroups} = groups

    // clone objects for each section that has a link to that clone
    if (Object.keys(this.nodesToBeCloned).length) {
      const directions = ['source', 'target']
      this.topologyOrder.forEach(type=>{
        if (nodeGroups[type] && nodeGroups[type].connected) {
          nodeGroups[type].connected.forEach(({nodeMap, details: {edges}})=>{
            const hashCode = this.hashCode(Object.keys(nodeMap).sort().join())
            edges.forEach(edge=>{
              directions.forEach(direction=>{
                const next = edge[direction]
                if (this.nodesToBeCloned[next]) {
                  const cuid = next+'_'+type+'_'+hashCode
                  if (!nodeMap[cuid]) {
                    let clone = this.nodeClones[cuid]
                    if (!clone) {
                      clone = this.nodeClones[cuid] = _.cloneDeep(this.nodesToBeCloned[next])
                      clone.layout = {
                        uid: cuid,
                        type: clone.type,
                        label: clone.name,
                        compactLabel: getWrappedNodeLabel(clone.name,12,2),
                        cloned: true
                      }
                    }
                    nodeMap[cuid] = clone
                    nodes.push(nodeMap[cuid])
                  }
                  edge.layout[direction] = nodeMap[cuid].layout
                }
              })
            })
          })
        }
      })

    }
  }

  createCollections = (groups) => {
    const {nodeGroups} = groups
    const collections = {connected:[], unconnected:[]}
    const cy = cytoscape({ headless: true }) // start headless cytoscape

    this.topologyOrder.forEach(type=>{
      if (nodeGroups[type]) {
        const {connected} = nodeGroups[type]
        let {unconnected} = nodeGroups[type]
        connected.forEach(({nodeMap, details})=>{
          const uidArr = []
          const {edges, title} = details
          const elements = {nodes:[], edges:[]}
          _.forOwn(nodeMap, (node) => {
            const n = {
              data: {
                id: node.layout.uid,
                node
              }
            }
            elements.nodes.push(n)
            uidArr.push(node.layout.uid)
          })
          edges.forEach(edge=>{
            const {layout, uid} = edge
            elements.edges.push({
              data: {
                source: layout.source.uid,
                target: layout.target.uid,
                edge
              }
            })
            uidArr.push(uid)
          })

          elements.nodes.sort((a, b)=>{
            const {node: {layout: la}} = a.data
            const {node: {layout: lb}} = b.data
            const r = la.type.localeCompare(lb.type)
            if (r!==0) {
              return r
            }
            return la.label.localeCompare(lb.label)
          })

          collections.connected.push({
            type,
            title,
            elements: cy.add(elements),
            hashCode: this.hashCode(uidArr.sort().join()),
            details
          })
        })
        unconnected = unconnected.filter(u=>u.layout!==undefined)

        // break unconnected up by cluster
        const detailMap = {}
        unconnected.forEach(node=>{
          const {clusterName='noclusters', type='notype'} = node
          let details = detailMap[clusterName]
          if (!details) {
            details = detailMap[clusterName] = {typeMap:{}, nodes:[]}
          }
          details.typeMap[type] = true
          details.nodes.push(node)
        })

        // for each cluster
        for (var clusterName in detailMap) {
          const {typeMap, nodes} = detailMap[clusterName]
          const clusters = [clusterName]
          const types = Object.keys(typeMap).sort()
          const details = {
            title: this.getSectionTitle(clusters, types),
            clusters: clusters.join('/')
          }

          // break large unconnected groups into smaller groups
          let unconnectArr = [nodes]
          if (nodes.length>48) {
            nodes.sort(({layout: {label: a='', uid:au, newComer: an}}, {layout:{label:b='', uid:bu, newComer: bn}})=>{
              if (!an && bn) {
                return -1
              } else if (an && !bn) {
                return 1
              }
              const r = a.localeCompare(b)
              if (r!==0) {
                return r
              } else {
                return au.localeCompare(bu)
              }
            })
            unconnectArr = _.chunk(nodes, 32)
          }
          unconnectArr.forEach(arr=>{
            const uidArr = []
            const elements = {nodes:[]}
            arr.forEach(node=>{
              if (node.layout.newComer) {
                node.layout.newComer.grid = true
              }
              elements.nodes.push({
                data: {
                  id: node.uid,
                  node
                }
              })
              uidArr.push(node.uid)
            })
            if (elements.nodes.length>0) {
              collections.unconnected.push({
                type,
                title: type,
                elements: cy.add(elements),
                hashCode: this.hashCode(uidArr.sort().join()),
                details
              })
            }
          })


        }
      }
    })
    return collections
  }

  setLayoutOptions = ({connected, unconnected}) => {
    const numOfSections = connected.length + unconnected.length
    this.setConnectedLayoutOptions(connected, numOfSections)
    this.setUnconnectedLayoutOptions(unconnected)
  }

  setConnectedLayoutOptions = (connected, numOfSections) => {
    connected.forEach(collection => {
      collection.options = this.getConnectedLayoutOptions(collection, numOfSections)
    })
  }

  getConnectedLayoutOptions = ({elements}, numOfSections) => {
    const isDAG = elements.nodes().length<=6
    if (isDAG) {
      return this.getDagreLayoutOptions(elements, numOfSections)
    } else {
      return this.getColaLayoutOptions(elements)
    }
  }

  getColaLayoutOptions = (elements) => {
    // stabilize diagram
    const nodes = elements.nodes()
    if (!this.firstLayout) {
      nodes.forEach(ele=>{
        const {node: {layout}} = ele.data()
        const {x=1000, y=1000} = layout
        ele.position({x, y})
      })
    }
    // if there are less nodes in this group we have room to stretch out the nodes
    const len = nodes.length
    const grpStretch = len<=10 ? 1.3 : (len<=15 ? 1.2 : (len<=20? 1.1: 1))
    const hubStretch = (isMajorHub, isMinorHub) => {
      if (isMajorHub) {
        return (len<=15 ? 1.2 : (len<=20? 1.5: 1.6))
      } else if (isMinorHub) {
        return (len<=15 ? 1.1 : (len<=20? 1.4: 1.5))
      }
      return 1
    }
    return {
      name: 'cola',
      animate: false,
      boundingBox: {
        x1: 0,
        y1: 0,
        w: 1000,
        h: 1000
      },
      // running in headless mode, we need to provide node size here
      // give hubs more space
      nodeSpacing: (node)=>{
        const {node:{layout:{scale=1, isMajorHub, isMinorHub}}} = node.data()
        return (NODE_SIZE*scale*grpStretch*hubStretch(isMajorHub, isMinorHub))
      },
      // align major hubs along y axis
      alignment: (node)=>{
        const {node:{layout:{isMajorHub}}} = node.data()
        return isMajorHub ? { y: 0 } : null
      },
      unconstrIter: 10, // works on positioning nodes to making edge lengths ideal
      userConstIter: 20, // works on flow constraints (lr(x axis)or tb(y axis))
      allConstIter: 20, // works on overlap
    }
  }

  getDagreLayoutOptions = () => {
    return {
      name: 'dagre',
      rankDir: 'LR',
      rankSep: NODE_SIZE*3, // running in headless mode, we need to provide node size here
      nodeSep: NODE_SIZE*2, // running in headless mode, we need to provide node size here
    }
  }

  setUnconnectedLayoutOptions = (unconnected) => {
    // get rough idea how many to allocate for each collection based on # of nodes
    const columns = unconnected.map(collection => {
      const count = collection.elements.nodes().length
      return count<=3 ? 1 : (count<=9 ? 3 : (count<=12 ? 4 : (count<=18? 6:8)))
    })
    unconnected.forEach((collection, index)=>{
      const count = collection.elements.length
      const cols = Math.min(count, columns[index])
      const h = Math.ceil(count/columns[index])*NODE_SIZE*2
      const w = cols*NODE_SIZE*3
      collection.options = {
        name: 'grid',
        avoidOverlap: false, // prevents node overlap, may overflow boundingBox if not enough space
        boundingBox: {
          x1: 0,
          y1: 0,
          w,
          h
        },
        sort: (a,b) => {
          const {node: {layout: la, selfLink:aself}} = a.data()
          const {node: {layout: lb, selfLink:bself}} = b.data()
          if (!la.newComer && lb.newComer) {
            return -1
          } else if (la.newComer && !lb.newComer) {
            return 1
          } else if (la.newComer && lb.newComer) {
            if (la.newComer.displayed && !lb.newComer.displayed) {
              return -1
            } else if (!la.newComer.displayed && lb.newComer.displayed) {
              return 1
            }
            return 0
          } else if (la.showDot && !lb.showDot) {
            return -1
          } else if (!la.showDot && lb.showDot) {
            return 1
          } else if (aself && !bself) {
            return -1
          } else if (!aself && bself) {
            return 1
          }
          const r = la.type.localeCompare(lb.type)
          if (r!==0) {
            return r
          }
          return la.label.localeCompare(lb.label)
        },
        cols
      }
    })
  }

  runCollectionLayouts = (collections, cb) => {
    // layout each collections
    const set = {}
    const newLayouts = collections.filter(({hashCode})=>{
      set[hashCode] = true
      return !this.cachedLayouts[hashCode]
    })
    for (const hashCode in this.cachedLayouts) {
      if (!set[hashCode]) {
        delete this.cachedLayouts[hashCode]
      }
    }

    let totalLayouts = newLayouts.length
    if (totalLayouts) {
      newLayouts.forEach((collection)=>{
        const {elements, options, hashCode} = collection
        options.hashCode = hashCode
        const layout = collection.layout = elements.layout(options)
        layout.pon('layoutstop').then(({layout: {adaptor, options}})=>{
          // save webcola adapter to layout edges later in linkHelper.layoutEdges
          if (adaptor) {
            this.cachedAdapters[options.hashCode] = adaptor
          }
          totalLayouts--
          if (totalLayouts<=0) {
            cb()
          }
        })
        try {
          layout.run()
        } catch (e) {
          totalLayouts--
          if (totalLayouts<=0) {
            cb()
          }
        }
      })
    } else {
      cb()
    }
  }

  layoutCollections = (collections, hiddenLinks) => {
    //const hiliteSelections = collections.length>3

    // get row dimensions
    let cells=0
    let maxWidth = 0
    let maxHeight = 0
    let totalMaxWidth = 0
    const xSpacer = NODE_SIZE*3
    const ySpacer = NODE_SIZE*2
    let currentX = 0
    let currentY = 0
    const rowDims = []
    const bboxArr = []

    // cache layouts
    const clayouts = []
    collections.forEach(({elements, details, hashCode, type, options:{name} })=>{
      // cache node positions
      let newLayout = false
      const {edges} = details
      let clayout = this.cachedLayouts[hashCode]
      if (!clayout) {
        newLayout = true
        this.cachedLayouts[hashCode] = clayout = {
          bbox: elements.boundingBox(),
          nodes: [],
          hashCode,
          type,
          details,
          name
        }
        elements.forEach(element=>{
          const data = element.data()
          if (element.isNode()) {
            const {node: {layout}, id} = data
            clayout.nodes.push({
              layout,
              id,
              position: element.position()
            })
          }
        })

        // layout and cache edge paths
        clayout.edges = layoutEdges(newLayout, clayout.nodes, elements.edges(), edges, this.selfLinks, this.cachedAdapters[hashCode])
        delete this.cachedAdapters[hashCode] //can only use once after a cytoscape layout
      }

      clayouts.push(this.cachedLayouts[hashCode])
    })

    // d3 latches onto the object so reuse old title objects
    const collectionMap = _.keyBy(collections, 'hashCode')
    // remove titles where collection is gone
    this.titles = this.titles.filter(({hashCode})=>{
      return !!collectionMap[hashCode]
    })
    // add title for any new collection
    let titleMap = _.keyBy(this.titles, 'hashCode')
    for (var hashCode in collectionMap) {
      if (!titleMap[hashCode]) {
        const {details: {title}}= collectionMap[hashCode]
        this.titles.push({
          title,
          hashCode,
          position: {}
        })
      }
    }
    titleMap = _.keyBy(this.titles, 'hashCode')

    // keep types together in larger sections
    const typeSizeMap = {}
    clayouts.forEach(({type, nodes}) => {
      if (!typeSizeMap[type]) {
        typeSizeMap[type] = 0
      }
      typeSizeMap[type] = typeSizeMap[type] + nodes.length
    })

    // sort layouts so they appear at the same spots in diagram
    clayouts.sort((a,b) => {
      const {nodes:ae, hashCode:ac, type:at, name:an, details: ad} = a
      const {nodes:be, hashCode:bc, type:bt, name:bn, details: bd} = b
      const ax = this.topologyOrder.indexOf(at)
      const bx = this.topologyOrder.indexOf(bt)
      // grids at end
      if (an!=='grid' && bn==='grid') {
        return -1
      } else if (an==='grid' && bn!=='grid') {
        return 1
      } else if (an==='grid' && bn==='grid') {
        // sort clusters by name
        if (ax-bx !==0) {
          return ax-bx
        }
        return ad.clusters.localeCompare(bd.clusters)
      } else {
        const {clusters: al, isMultiCluster: am} = ad
        const {clusters: bl, isMultiCluster: bm} = bd

        // multicluster towards top
        if (am && !bm) {
          return -1
        } else if (!am && bm) {
          return 1
        }

        // sort larger sections by size
        const az = ae.length
        const bz = be.length
        if (az>=5 && bz<5) {
          return -1
        } else if (az<5 && bz>=5) {
          return 1
        } else if (az>=5 && bz>=5) {
          let r = typeSizeMap[bt] - typeSizeMap[at]
          if (r!==0) {
            return r
          }
          r = bz-az
          if (r!==0) {
            return r
          }

        }

        // else then sort by cluster name
        if (al && bl) {
          const r = al.localeCompare(bl)
          if (r!==0) {
            return r
          }
        }

        // sort smaller connected scetions
        if (az-bz !==0 ) {
          return bz-az
        }

        // else sort by type
        if (ax-bx !==0) {
          return ax-bx
        }

      }
      // all else fails use hash code
      return ac-bc
    })

    // determine rows
    const idxToRowMap = {}
    clayouts.forEach(({bbox, name}, idx)=>{
      const {w, h} = bbox
      bboxArr.push(bbox)
      idxToRowMap[idx] = rowDims.length
      cells++
      const lastLayout = idx === clayouts.length - 1

      // keep track of the dimensions
      maxWidth = Math.max(currentX+w, maxWidth)
      totalMaxWidth = Math.max(maxWidth, totalMaxWidth)
      currentX += w + xSpacer
      maxHeight = Math.max(h, maxHeight)

      const nextName = !lastLayout ? clayouts[idx+1].name : 'last'
      if (currentX>this.breakWidth || // greater then screen width
          (cells>5 && name!=='grid' && nextName==='grid') ||
          lastLayout
      ) {
        rowDims.push({
          rowWidth: maxWidth,
          rowHeight: maxHeight+NODE_SIZE*2, // make room for title on tallest section
          cells
        })
        maxHeight=maxWidth=cells=0
        currentX = 0
      }
    })

    // layout collection "cells"
    let row = 0
    let cell = 1
    currentX = 0
    currentY = 0
    const layoutMap = {}
    let xSpcr = xSpacer*2
    const layoutBBox = {}
    clayouts.forEach(({nodes, edges, name, hashCode}, idx)=>{
      // this collection's bounding box
      const {x1, y1, w, h} = bboxArr[idx]

      // figure out our row
      if (idxToRowMap[idx]>row) {
        const {rowHeight} = rowDims[row]
        row = idxToRowMap[idx]
        currentY += rowHeight + ySpacer
        currentX = 0
        cell = 1
      }
      const {rowWidth, rowHeight, cells} = rowDims[row]

      // center cells in their rows and evenly space
      let dxCell = 0
      let spacer = totalMaxWidth-rowWidth
      if (spacer) {
        switch (cells) {
        case 1:
          spacer/=2
          dxCell = spacer
          break
        case 2:
          xSpcr=xSpacer*3
          spacer = (totalMaxWidth-rowWidth-xSpcr)/2
          dxCell = spacer
          break
        default:
          spacer/=cells
          if (spacer<xSpacer*2) {
            dxCell = spacer*cell - spacer
          } else {
            xSpcr=xSpacer*2
            spacer = (totalMaxWidth-rowWidth-xSpcr)/2
            dxCell = spacer
          }
          break
        }
      }
      const dyCell = row===0 ? 0 : (name==='grid' ? NODE_SIZE*2:(rowHeight-h)/2)
      const center = {x:currentX+dxCell+(w/2), y:currentY+dyCell+(h/2)}
      const transform = {x: currentX + dxCell - x1, y: currentY + dyCell - y1}

      // set title position
      const title = titleMap[hashCode]
      title.x = currentX + dxCell - NODE_SIZE/2
      title.y = currentY + dyCell - NODE_SIZE*2

      // keep track of bounding box
      layoutBBox.x1 = Math.min(layoutBBox.x1||title.x, title.x)
      layoutBBox.y1 = Math.min(layoutBBox.y1||title.y, title.y)

      // set all node positions
      nodes.forEach(node=>{
        const {layout, position: {x,y}} = node
        layout.x = x + transform.x
        layout.y = y + transform.y

        // keep track of bounding box
        layoutBBox.x2 = Math.max(layoutBBox.x2||layout.x, layout.x)
        layoutBBox.y2 = Math.max(layoutBBox.y2||layout.y, layout.y)

        layout.center = center

        // restore position of any node dragged by user
        if (layout.dragged) {
          layout.undragged = {
            x: layout.x,
            y: layout.y
          }
          layout.x = layout.dragged.x
          layout.y = layout.dragged.y
        }
      })

      // set edge centers
      edges.forEach(edge=>{
        const {layout, uid} = edge
        layout.center = center
        layout.transform = transform
        layout.hidden = hiddenLinks.has(uid)

        // if source or target was dragged, take all the kinks out of the line
        const {source: {dragged:sdragged}, target: {dragged:tdragged}} = layout
        if (!layout.isLoop && (sdragged || tdragged)) {
          setDraggedLineData(layout)
        }
      })

      currentX += w + xSpcr
      cell++
    })
    layoutBBox.width = (layoutBBox.x2-layoutBBox.x1) * 1.1 // give diagram size to grow 10% in live mode
    layoutBBox.height = (layoutBBox.y2-layoutBBox.y1) * 1.1
    return {layoutMap, titles: this.titles, selfLinks: this.selfLinks, layoutBBox }
  }

  gatherSectionDetails = (allNodeMap, nodes, nodeInfo) => {
    if (this.topologyOptions.showSectionTitles) {
      nodes.forEach(({uid})=>{
        if (allNodeMap[uid]) {
          const {clusterName, type} = allNodeMap[uid]
          nodeInfo.clusterMap[clusterName] = true
          nodeInfo.typeMap[type] = true
        }
      })
    }
  }

  setSectionDetails = (section, details, edgeMap) => {
    if (this.topologyOptions.showSectionTitles) {
      const {clusterMap, typeMap} = details
      const clusters = Object.keys(clusterMap).sort()
      const types = Object.keys(typeMap).sort()
      const isMultiCluster = clusters.length>1
      section.details = {
        title: this.getSectionTitle(clusters, types),
        clusters: clusters.join('/'),
        edges: Object.values(edgeMap),
        isMultiCluster
      }
    } else {
      section.details = {
        edges: Object.values(edgeMap),
      }
    }
  }

  // if showing multiple clusters in view, add cluster name to title
  // else just section types
  getSectionTitle = (clusters, types) => {
    if (this.topologyOptions.showSectionTitles) {
      return (this.isMulticluster ? (clusters.join(', ') +'\n') : '') +
         this.topologyOptions.showSectionTitles(types, this.locale)
    }
    return ''
  }

  hashCode = (str) => {
    let hash = 0, i, chr
    for (i = 0; i < str.length; i++) {
      chr   = str.charCodeAt(i)
      hash  = ((hash << 5) - hash) + chr
      hash |= 0
    }
    return hash
  }

}
