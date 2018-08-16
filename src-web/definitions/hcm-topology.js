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

export default {
  topologyOrder: ['host', 'service', 'controller', 'pod', 'container', 'unmanaged'],
  topologyShapes: {
    'internet': {
      shape: 'circle',
      className: 'internet'
    },
    'host': {
      shape: 'circle',
      className: 'host'
    },
    'service': {
      shape: 'heptagon',
      className: 'service'
    },
    'deployment': {
      shape: 'circle',
      className: 'deployment'
    },
    'daemonset': {
      shape: 'octogon',
      className: 'daemonset'
    },
    'statefulset': {
      shape: 'heptagon',
      className: 'statefulset'
    },
    'pod': {
      shape: 'circle',
      className: 'pod'
    },
    'container': {
      shape: 'octogon',
      className: 'container'
    },
  },
  topologyNodeDescription: setNodeInfo,
  topologyTransform: topologyTransform,
  topologyNodeDetails: getNodeDetails,
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

  // FIXME: We don't have a way to show links to self, so removing those links until the diagram can paint those correctly.
  modifiedLinks = modifiedLinks.filter(l => l.source !== l.target)

  // get just the clusters
  const clusterMap = {}
  const clusters = nodes.reduce((prev, curr) => {
    if (curr.cluster !== null && !prev.find(c => c.id === curr.cluster)){
      const node = nodes.find(n => n.id === curr.cluster)
      if (node && node.name) {
        clusterMap[curr.cluster] = node.name
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
    if (n.type !== 'cluster' && n.uid) {
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

export function setNodeInfo(node, locale) {
  const {layout} = node
  if (layout) {
    const {pods, services} = layout
    if (pods && pods.length) {
      layout.info = msgs.get('topology.controller.pods', [node.type, layout.pods.length], locale)
    } else if (services && services.length) {
      layout.info = msgs.get('topology.service.controller', [node.type], locale)
    }
  }
}

export function getNodeDetails(currentNode) {
  const details = []
  if (currentNode){
    currentNode.type && details.push({
      type: 'label',
      labelKey: 'resource.type',
      value: currentNode.type,
    })
    currentNode.clusterName && details.push({
      type: 'label',
      labelKey: 'resource.cluster',
      value: currentNode.clusterName,
    })
    currentNode.namespace && details.push({
      type: 'label',
      labelKey: 'resource.namespace',
      value: currentNode.namespace,
    })
    currentNode.topology && details.push({
      type: 'label',
      labelKey: 'resource.topology',
      value: currentNode.topology,
    })
  }
  return details
}
