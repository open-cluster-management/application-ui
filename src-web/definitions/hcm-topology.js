/*******************************************************************************
 * Licensed Materials - Property of IBM
 * (c) Copyright IBM Corporation 2018. All Rights Reserved.
 *
 * Note to U.S. Government Users Restricted Rights:
 * Use, duplication or disclosure restricted by GSA ADP Schedule
 * Contract with IBM Corp.
 *******************************************************************************/
'use strict'

import msgs from '../../nls/platform.properties'
import _ from 'lodash'

// topologyCloneTypes: types that can appear through diagram, better to clone them for each group that wants it
// topologyOrder: general order in which to organize diagram with 'internet' at upper left and container at lower right
// topologyNodeLayout: what description to but under node in diagram
// topologyTransform: how to convert a model into nodes and edges
// topologyNodeDetails: what desciption to put in details view when node is clicked
export default {
  topologyCloneTypes: ['internet', 'host'],
  topologyOrder: ['internet', 'host', 'service', 'controller', 'cronjob', 'pod', 'container'],
  topologyShapes: {
    'internet': {
      shape: 'cloud',
      className: 'internet'
    },
    'host': {
      shape: 'host',
      className: 'host'
    },
    'service': {
      shape: 'hexagon',
      className: 'service'
    },
    'deployment': {
      shape: 'gear',
      className: 'deployment'
    },
    'daemonset': {
      shape: 'star4',
      className: 'daemonset'
    },
    'statefulset': {
      shape: 'cylinder',
      className: 'statefulset'
    },
    'pod': {
      shape: 'circle',
      className: 'pod'
    },
    'container': {
      shape: 'irregularHexagon',
      className: 'container'
    },
    'cronjob': {
      shape: 'clock',
      className: 'default'
    },
  },
  topologyNodeLayout: setNodeInfo,
  topologyTransform: topologyTransform,
  topologyNodeDetails: getNodeDetails,
  topologyOptions: {
    showHubs: true,
    showSectionTitles: showSectionTitles, // show section titles
  }
}

export function topologyTransform(resourceItem) {
  const { nodes = [], links = [] } = resourceItem

  // We need to change "to/from" to "source/target" to satisfy D3's API.
  let modifiedLinks = links.map((l)=>({
    source: l.from.uid,
    target: l.to.uid,
    label: l.type,
    type: l.type,
    uid: l.from.uid + l.to.uid,
  }))

  // filter out links to self, then add as a new svg circular arrow on node
  const nodeMap = _.keyBy(nodes, 'uid')
  modifiedLinks = modifiedLinks.filter(l => {
    if (l.source !== l.target) {
      return true
    } else {
      nodeMap[l.source].selfLink = l
    }
  })

  // get just the clusters
  const clusterMap = {}
  const clusters = nodes.reduce((prev, curr) => {
    if (curr.cluster !== null && !prev.find(c => c.id === curr.cluster)){
      const node = nodes.find(n => n.id === curr.cluster)
      if (node && node.name) {
        // if weave can't find a cluster it creates an 'unmanaged' cluster
        clusterMap[curr.cluster] =  node.type==='unmanaged' ? node.type : node.name
        prev.push({
          id: curr.cluster,
          index: prev.length,
          name: node.name
        })
      }
    }
    return prev
  }, [])

  // get just the nodes
  const nodesWithoutClusters = nodes.filter(n => {
    if (n.type !== 'cluster' && n.type !== 'unmanaged' && n.uid) {
      n.clusterName = clusterMap[n.cluster]
      return true
    }
    return false
  })

  return {
    clusters,
    links: modifiedLinks,
    nodes: nodesWithoutClusters
  }
}

export function showSectionTitles(types, locale) {
  const set = new Set()
  types.forEach(type=>{
    switch (type) {
    case 'pod':
      set.add(msgs.get('topology.title.pods', locale))
      break

    case 'service':
      set.add(msgs.get('topology.title.services', locale))
      break

    case 'container':
      set.add(msgs.get('topology.title.containers', locale))
      break

    case 'host':
      set.add(msgs.get('topology.title.hosts', locale))
      break

    case 'internet':
      set.add(msgs.get('topology.title.internet', locale))
      break

    default:
      set.add(msgs.get('topology.title.controllers', locale))
      break
    }
  })
  return Array.from(set).sort().join(', ')

}

export function setNodeInfo(node, locale) {
  const {layout} = node
  if (layout) {
    const {hasPods, hasService, type} = layout
    switch (type) {
    case 'internet':
      layout.info = node.namespace
      break

    default:
      if (hasPods) {
        layout.info = msgs.get('topology.controller.pods', [node.type, layout.pods.length], locale)
      } else if (hasService) {
        layout.info = msgs.get('topology.service.controller', [node.type], locale)
      }
      break
    }

    // hubs are drawn bigger
    if (layout.isMajorHub) {
      layout.scale = 1.6
    } else if (layout.isMinorHub) {
      layout.scale = 1.4
    }
  }
}

export function getNodeDetails(currentNode) {
  const details = []
  if (currentNode){
    const { clusterName, name, namespace, topology, type, layout, labels=[] } = currentNode
    const { hasPods, hasService, pods, type: ltype } = layout

    const addDetails = (dets) => {
      dets.forEach(({labelKey, value})=>{
        if (value) {
          details.push({
            type: 'label',
            labelKey,
            value,
          })
        }
      })
    }

    // the main stuff
    const mainDetails = [
      {labelKey: 'resource.type',
        value: ltype||type},
      {labelKey: 'resource.cluster',
        value: clusterName},
      {labelKey: 'resource.namespace',
        value: namespace},
      {labelKey: 'resource.topology',
        value: topology},
    ]
    addDetails(mainDetails)

    // labels
    if (labels.length) {
      details.push({
        type: 'label',
        labelKey: 'resource.labels'
      })
      labels.forEach(({name:lname, value:lvalue})=>{
        const labelDetails = [
          {value: `${lname} = ${lvalue}`},
        ]
        addDetails(labelDetails)
      })
    }

    // controllers
    if (hasService) {
      details.push({
        type: 'label',
        labelKey: 'resource.controllers.used'
      })
      // the controller stuff
      const ctrlDetails = [
        {labelKey: 'resource.name',
          value: name},
        {labelKey: 'resource.type',
          value: type},
      ]
      addDetails(ctrlDetails)
    }

    // pods
    if (hasPods) {
      details.push({
        type: 'label',
        labelKey: 'resource.pods.deployed'
      })

      // the pod stuff
      pods.forEach(({name:pname})=>{
        const podDetails = [
          {value: pname},
        ]
        addDetails(podDetails)

      })
    }
  }
  return details
}
