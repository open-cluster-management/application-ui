/*******************************************************************************
 * Licensed Materials - Property of IBM
 * (c) Copyright IBM Corporation 2019. All Rights Reserved.
 *
 * Note to U.S. Government Users Restricted Rights:
 * Use, duplication or disclosure restricted by GSA ADP Schedule
 * Contract with IBM Corp.
 * Copyright (c) 2020 Red Hat, Inc.
 *******************************************************************************/
'use strict'

import React from 'react'
import {
  VALIDATE_ALPHANUMERIC,
  VALIDATE_URL
} from '../../TemplateEditor/utils/validation'
import {
  HCMChannelList,
  HCMNamespaceList,
  HCMPlacementRuleList
} from '../../../../lib/client/queries'
import TimeWindow from '../components/TimeWindow'
import ClusterSelector from '../components/ClusterSelector'
import _ from 'lodash'

import {
  setAvailableRules,
  setAvailableNSSpecs,
  getExistingPRControlsSection,
  updateNewRuleControlsData,
  setAvailableChannelSpecs,
  getGitBranches
} from './utils'

const VALID_DNS_LABEL = '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'
const existingRuleCheckbox = 'existingrule-checkbox'
const localClusterCheckbox = 'local-cluster-checkbox'

export const loadExistingChannels = type => {
  return {
    query: HCMChannelList,
    loadingDesc: 'creation.app.loading.channels',
    setAvailable: setAvailableChannelSpecs.bind(null, type)
  }
}

export const loadExistingPlacementRules = () => {
  return {
    query: HCMPlacementRuleList,
    loadingDesc: 'creation.app.loading.rules',
    setAvailable: setAvailableRules.bind(null)
  }
}

export const loadExistingNamespaces = () => {
  return {
    query: HCMNamespaceList,
    loadingDesc: 'creation.app.loading.namespaces',
    setAvailable: setAvailableNSSpecs.bind(null)
  }
}

export const updateNSControls = (nsControl, globalControl) => {
  const { active, availableData } = nsControl

  const userDefinedNSControl = globalControl.find(
    ({ id }) => id === 'userDefinedNamespace'
  )

  userDefinedNSControl.active =
    availableData[active] === undefined ? active : ''

  return updateControlsForNS(nsControl, nsControl, globalControl)
}

export const updateControlsForNS = (
  initiatingControl,
  nsControl,
  globalControl
) => {
  const { active, availableData } = nsControl

  const controlList = getExistingPRControlsSection(
    initiatingControl,
    globalControl
  )
  controlList.forEach(control => {
    const existingRuleControl = _.get(control, 'placementrulecombo')
    const existingruleCheckbox = _.get(control, existingRuleCheckbox)
    const selectedRuleNameControl = _.get(control, 'selectedRuleName')
    //update placement rule controls
    if (existingRuleControl && existingruleCheckbox) {
      if (availableData===undefined || availableData[active] === undefined) {
        //user defined namespace
        _.set(existingruleCheckbox, 'type', 'hidden')
        _.set(existingRuleControl, 'type', 'hidden')

        _.set(existingRuleControl, 'ns', '')
        selectedRuleNameControl && _.set(selectedRuleNameControl, 'active', '')
        _.set(existingruleCheckbox, 'active', false)
      } else {
        //existing namespace
        _.set(existingruleCheckbox, 'type', 'checkbox')
        _.set(existingruleCheckbox, 'active', false)

        _.set(existingRuleControl, 'ns', active)
        _.set(existingRuleControl, 'type', 'hidden')
      }
      _.set(existingRuleControl, 'active', '')
      updateNewRuleControlsData('', control)
    }
  })

  return globalControl
}

export const updateNewRuleControls = (urlControl, controlGlobal) => {
  const controlList = getExistingPRControlsSection(urlControl, controlGlobal)

  const { active, availableData } = urlControl
  const selectedPR = availableData[active]

  controlList.forEach(control => {
    const selectedRuleNameControl = _.get(control, 'selectedRuleName')
    selectedRuleNameControl.active = active

    updateNewRuleControlsData(selectedPR, control)
  })
}

export const updateDisplayForPlacementControls = (
  urlControl,
  controlGlobal
) => {
  //hide or show placement rule settings if user selects an existing PR
  const { active } = urlControl
  const controlList = getExistingPRControlsSection(urlControl, controlGlobal)

  controlList.forEach(control => {
    const existingRuleControl = _.get(control, 'placementrulecombo')

    const onlineControl = _.get(control, 'online-cluster-only-checkbox')
    const clusterSelectorControl = _.get(control, 'clusterSelector')

    const clusterReplicasControl = _.get(control, 'clusterReplicas')

    const localClusterControl = _.get(control, localClusterCheckbox)

    if (active === true) {
      _.set(existingRuleControl, 'type', 'singleselect')

      _.set(onlineControl, 'type', 'hidden')
      _.set(clusterSelectorControl, 'type', 'hidden')
      _.set(clusterReplicasControl, 'type', 'hidden')
      _.set(localClusterControl, 'type', 'hidden')
    } else {
      _.set(existingRuleControl, 'type', 'hidden')

      _.set(onlineControl, 'type', 'checkbox')
      _.set(clusterSelectorControl, 'type', 'custom')
      _.set(clusterReplicasControl, 'type', 'text')
      _.set(localClusterControl, 'type', 'checkbox')
    }

    //reset all values
    _.set(localClusterControl, 'active', false)
    _.set(onlineControl, 'active', false)
    _.set(clusterReplicasControl, 'active', '')
    clusterSelectorControl.active.clusterLabelsListID = 1
    delete clusterSelectorControl.active.clusterLabelsList
    clusterSelectorControl.active.clusterLabelsList = [
      { id: 0, labelName: '', labelValue: '', validValue: true }
    ]
    clusterSelectorControl.active.mode = false
    delete clusterSelectorControl.showData
  })
}

export const updatePlacementControls = placementControl => {
  //update PR controls on channel or ns change
  const { active, groupControlData } = placementControl

  const onlineControl = groupControlData.find(
    ({ id }) => id === 'online-cluster-only-checkbox'
  )
  const clusterSelectorControl = groupControlData.find(
    ({ id }) => id === 'clusterSelector'
  )
  const clusterReplicasControl = groupControlData.find(
    ({ id }) => id === 'clusterReplicas'
  )

  if (active === true) {
    onlineControl && _.set(onlineControl, 'type', 'hidden')
    clusterSelectorControl && _.set(clusterSelectorControl, 'type', 'hidden')
    clusterReplicasControl && _.set(clusterReplicasControl, 'type', 'hidden')
  } else {
    onlineControl && _.set(onlineControl, 'type', 'checkbox')
    clusterSelectorControl && _.set(clusterSelectorControl, 'type', 'custom')
    clusterReplicasControl && _.set(clusterReplicasControl, 'type', 'text')
  }

  return groupControlData
}

export const updateGitCredentials = urlControl => {
  const groupControlData = _.get(urlControl, 'groupControlData')

  const userCtrlData = _.get(
    groupControlData.find(({ id }) => id === 'githubUser'),
    'active',
    ''
  )

  const tokenCtrlData = _.get(
    groupControlData.find(({ id }) => id === 'githubAccessId'),
    'active',
    ''
  )

  if (
    (userCtrlData.length > 0 && tokenCtrlData.length > 0) ||
    (userCtrlData.length === 0 && tokenCtrlData.length === 0)
  ) {
    getGitBranches(_.get(urlControl, 'groupControlData'))
  }
  return groupControlData
}

export const updateChannelControls = (urlControl, globalControl) => {
  getGitBranches(_.get(urlControl, 'groupControlData'))

  //update existing placement rule section when user changes the namespace
  const nsControl = globalControl.find(
    ({ id: idCtrl }) => idCtrl === 'namespace'
  )
  updateControlsForNS(urlControl, nsControl, globalControl)

  const { active, availableData, groupControlData } = urlControl
  const pathData = availableData[active]

  const nameControl = groupControlData.find(
    ({ id: idCtrl }) => idCtrl === 'channelName'
  )
  const namespaceControl = groupControlData.find(
    ({ id }) => id === 'channelNamespace'
  )
  // change channel name and namespace to reflect repository path
  if (active) {
    const a = document.createElement('a')
    a.href = active

    // if existing channel, reuse channel name and namespace
    if (pathData && pathData.metadata) {
      nameControl.active = pathData.metadata.name
      namespaceControl.active = pathData.metadata.namespace
    } else {
      let name = a.pathname.split('/').pop()
      name = name.split('.').shift()
      nameControl.active = `${name}-chn`
      namespaceControl.active = ''
    }
  } else {
    nameControl.active = 'resource'
    namespaceControl.active = ''
  }

  let control
  // if existing channel, hide user/token controls
  const type = !pathData ? 'text' : 'hidden'
  const setType = cid => {
    control = groupControlData.find(({ id }) => id === cid)
    _.set(control, 'type', type)
    if (type === 'hidden') {
      _.set(control, 'active', '')
    }
  }
  const { id } = urlControl
  switch (id) {
  case 'githubURL':
    setType('githubUser')
    setType('githubAccessId')
    break
  case 'objectstoreURL':
    setType('accessKey')
    setType('secretKey')
    break
  case 'helmURL':
    setType('helmUser')
    setType('helmPassword')
    break
  }

  return globalControl
}

const githubChannelData = [
  ///////////////////////  github  /////////////////////////////////////
  {
    id: 'channelName',
    type: 'hidden',
    active: 'resource'
  },
  {
    id: 'channelNamespace',
    type: 'hidden',
    active: ''
  },
  {
    name: 'creation.app.github.url',
    tooltip: 'tooltip.creation.app.github.url',
    id: 'githubURL',
    type: 'combobox',
    active: '',
    placeholder: 'app.enter.select.github.url',
    available: [],
    validation: VALIDATE_URL,
    fetchAvailable: loadExistingChannels('git'),
    onSelect: updateChannelControls
  },
  {
    name: 'creation.app.github.user',
    tooltip: 'tooltip.creation.app.github.user',
    id: 'githubUser',
    type: 'text',
    active: '',
    encode: true,
    placeholder: 'app.enter.select.username',
    onSelect: updateGitCredentials
  },
  {
    name: 'creation.app.github.accessid',
    tooltip: 'tooltip.creation.app.github.accessid',
    id: 'githubAccessId',
    type: 'text',
    encode: true,
    active: '',
    placeholder: 'app.enter.access.token',
    onSelect: updateGitCredentials
  },
  {
    name: 'creation.app.github.branch',
    tooltip: 'tooltip.creation.app.github.branch',
    id: 'githubBranch',
    type: 'combobox',
    active: '',
    placeholder: 'app.enter.select.branch',
    available: [],
    validation: VALIDATE_ALPHANUMERIC,
    cacheUserValueKey: 'create.app.github.branch'
  },
  {
    name: 'creation.app.github.path',
    tooltip: 'tooltip.creation.app.github.path',
    id: 'githubPath',
    type: 'combobox',
    active: '',
    placeholder: 'app.enter.select.path',
    available: [],
    validation: VALIDATE_ALPHANUMERIC,
    cacheUserValueKey: 'create.app.github.path'
  },
  ////////////////////////////////////////////////////////////////////////////////////
  ///////////////////////  pre/post jobs  /////////////////////////////////////
  {
    id: 'perPostSection',
    type: 'section',
    title: 'creation.app.section.prePost',
    overline: true,
    collapsable: true,
    collapsed: false
  },
  {
    name: 'creation.app.pre.job',
    tooltip: 'tooltip.creation.app.preJob',
    id: 'preJob',
    type: 'combobox',
    active: '',
    placeholder: 'app.enter.select.preJob',
    validation: VALIDATE_ALPHANUMERIC,
    available: []
  },
  {
    name: 'creation.app.post.job',
    tooltip: 'tooltip.creation.app.postJob',
    id: 'postJob',
    type: 'combobox',
    active: '',
    placeholder: 'app.enter.select.postJob',
    validation: VALIDATE_ALPHANUMERIC,
    available: []
  },
  ////////////////////////////////////////////////////////////////////////////////////
  ///////////////////////  clusters  /////////////////////////////////////
  {
    id: 'clusterSection',
    type: 'section',
    title: 'creation.app.placement.rule',
    overline: true,
    collapsable: true,
    collapsed: false
  },
  {
    id: existingRuleCheckbox,
    type: 'hidden',
    name: 'creation.app.settings.existingRule',
    tooltip: 'tooltip.creation.app.settings.existingRule',
    onSelect: updateDisplayForPlacementControls,
    active: false,
    available: [],
    validation: {}
  },
  {
    name: 'creation.app.exitingRuleCombo',
    tooltip: 'tooltip.creation.app.exitingRuleCombo',
    id: 'placementrulecombo',
    type: 'hidden',
    fetchAvailable: loadExistingPlacementRules(),
    onSelect: updateNewRuleControls,
    validation: {}
  },
  {
    id: 'selectedRuleName',
    type: 'hidden',
    active: ''
  },
  {
    id: localClusterCheckbox,
    type: 'checkbox',
    name: 'creation.app.settings.localClusters',
    tooltip: 'tooltip.creation.app.settings.localClusters',
    onSelect: updatePlacementControls,
    active: false,
    available: []
  },
  {
    id: 'online-cluster-only-checkbox',
    type: 'checkbox',
    name: 'creation.app.settings.onlineClusters',
    tooltip: 'tooltip.creation.app.settings.onlineClusters',
    active: false,
    available: []
  },
  {
    type: 'custom',
    id: 'clusterSelector',
    component: <ClusterSelector />,
    available: []
  },
  {
    name: 'creation.app.settings.clustersReplica',
    tooltip: 'tooltip.creation.app.settings.clustersReplica',
    id: 'clusterReplicas',
    type: 'text',
    active: '',
    placeholder: 'creation.app.settings.ph.clustersReplica',
    available: [],
    validation: {}
  },
  ////////////////////////////////////////////////////////////////////////////////////
  ///////////////////////  settings  /////////////////////////////////////
  {
    id: 'settingsSection',
    type: 'section',
    title: 'creation.app.section.settings',
    overline: true,
    collapsable: true,
    collapsed: false
  },
  {
    type: 'custom',
    name: 'creation.app.settings.timeWindow',
    tooltip: 'creation.app.settings.timeWindow.tooltip',
    id: 'timeWindow',
    component: <TimeWindow />,
    available: []
  }
]

const hubClusterChannelData = [
  ///////////////////////  Hub Cluster  /////////////////////////////////////

  ////////////////////////////////////////////////////////////////////////////////////
  ///////////////////////  clusters  /////////////////////////////////////
  {
    id: 'channelName',
    type: 'hidden',
    active: 'resource'
  },
  {
    id: 'channelNamespace',
    type: 'hidden',
    active: ''
  },
  {
    name: 'creation.app.namespace.name',
    tooltip: 'tooltip.creation.app.namespace.name',
    id: 'namespaceChannelName',
    type: 'combobox',
    active: '',
    placeholder: 'app.enter.select.namespace.name',
    available: [],
    validation: [],
    fetchAvailable: loadExistingChannels('namespace'),
    onSelect: updateChannelControls
  },
  ////////////////////////////////////////////////////////////////////////////////////
  ///////////////////////  pre/post jobs  /////////////////////////////////////
  {
    id: 'perPostSection',
    type: 'section',
    title: 'creation.app.section.prePost',
    overline: true,
    collapsable: true,
    collapsed: false
  },
  {
    name: 'creation.app.pre.job',
    tooltip: 'tooltip.creation.app.preJob',
    id: 'preJob',
    type: 'combobox',
    active: '',
    placeholder: 'app.enter.select.preJob',
    validation: VALIDATE_ALPHANUMERIC,
    available: []
  },
  {
    name: 'creation.app.post.job',
    tooltip: 'tooltip.creation.app.postJob',
    id: 'postJob',
    type: 'combobox',
    active: '',
    placeholder: 'app.enter.select.postJob',
    validation: VALIDATE_ALPHANUMERIC,
    available: []
  },
  ////////////////////////////////////////////////////////////////////////////////////
  ///////////////////////  clusters  /////////////////////////////////////
  {
    id: 'clusterSection',
    type: 'section',
    title: 'creation.app.placement.rule',
    overline: true,
    collapsable: true,
    collapsed: false
  },
  {
    id: existingRuleCheckbox,
    type: 'hidden',
    name: 'creation.app.settings.existingRule',
    tooltip: 'tooltip.creation.app.settings.existingRule',
    onSelect: updateDisplayForPlacementControls,
    active: false,
    available: [],
    validation: {}
  },
  {
    name: 'creation.app.exitingRuleCombo',
    tooltip: 'tooltip.creation.app.exitingRuleCombo',
    id: 'placementrulecombo',
    type: 'hidden',
    fetchAvailable: loadExistingPlacementRules(),
    onSelect: updateNewRuleControls,
    validation: {}
  },
  {
    id: 'selectedRuleName',
    type: 'hidden',
    active: ''
  },
  {
    id: localClusterCheckbox,
    type: 'checkbox',
    name: 'creation.app.settings.localClusters',
    tooltip: 'tooltip.creation.app.settings.localClusters',
    onSelect: updatePlacementControls,
    active: false,
    available: []
  },
  {
    id: 'online-cluster-only-checkbox',
    type: 'checkbox',
    name: 'creation.app.settings.onlineClusters',
    tooltip: 'tooltip.creation.app.settings.onlineClusters',
    active: false,
    available: []
  },
  {
    type: 'custom',
    id: 'clusterSelector',
    component: <ClusterSelector />,
    available: []
  },
  {
    name: 'creation.app.settings.clustersReplica',
    tooltip: 'tooltip.creation.app.settings.clustersReplica',
    id: 'clusterReplicas',
    type: 'text',
    active: '',
    placeholder: 'creation.app.settings.ph.clustersReplica',
    available: [],
    validation: {}
  },
  ////////////////////////////////////////////////////////////////////////////////////
  ///////////////////////  settings  /////////////////////////////////////
  {
    id: 'settingsSection',
    type: 'section',
    title: 'creation.app.section.settings',
    overline: true,
    collapsable: true,
    collapsed: false
  },
  {
    type: 'custom',
    name: 'creation.app.settings.timeWindow',
    tooltip: 'creation.app.settings.timeWindow.tooltip',
    id: 'timeWindow',
    component: <TimeWindow />,
    available: []
  }
]

const helmReleaseChannelData = [
  ///////////////////////  HelmRelease  /////////////////////////////////////
  {
    id: 'channelName',
    type: 'hidden',
    active: 'resource'
  },
  {
    id: 'channelNamespace',
    type: 'hidden',
    active: ''
  },
  {
    name: 'creation.app.helmrepo.url',
    tooltip: 'tooltip.creation.app.helmrepo.url',
    id: 'helmURL',
    type: 'combobox',
    active: '',
    placeholder: 'app.enter.select.helmrepo.url',
    available: [],
    validation: VALIDATE_URL,
    fetchAvailable: loadExistingChannels('helmrepo'),
    onSelect: updateChannelControls
  },
  {
    name: 'creation.app.helmrepo.user',
    tooltip: 'tooltip.creation.app.helmrepo.user',
    id: 'helmUser',
    type: 'text',
    active: '',
    encode: true,
    placeholder: 'app.enter.helmrepo.username'
  },
  {
    name: 'creation.app.helmrepo.password',
    tooltip: 'tooltip.creation.app.helmrepo.password',
    id: 'helmPassword',
    type: 'text',
    encode: true,
    active: '',
    placeholder: 'app.enter.helmrepo.password'
  },
  {
    name: 'creation.app.helmrepo.chart.name',
    tooltip: 'tooltip.creation.app.helmrepo.chart.name',
    id: 'helmChartName',
    type: 'text',
    active: '',
    placeholder: 'app.enter.helmrepo.chart.name',
    validation: {
      required: true
    }
  },
  {
    name: 'creation.app.helmrepo.package.version',
    tooltip: 'tooltip.creation.app.helmrepo.package.version',
    id: 'helmPackageVersion',
    type: 'text',
    active: '',
    placeholder: 'app.enter.helmrepo.package.version'
  },
  ////////////////////////////////////////////////////////////////////////////////////
  ///////////////////////  pre/post jobs  /////////////////////////////////////
  {
    id: 'perPostSection',
    type: 'section',
    title: 'creation.app.section.prePost',
    overline: true,
    collapsable: true,
    collapsed: false
  },
  {
    name: 'creation.app.pre.job',
    tooltip: 'tooltip.creation.app.preJob',
    id: 'preJob',
    type: 'combobox',
    active: '',
    placeholder: 'app.enter.select.preJob',
    validation: VALIDATE_ALPHANUMERIC,
    available: []
  },
  {
    name: 'creation.app.post.job',
    tooltip: 'tooltip.creation.app.postJob',
    id: 'postJob',
    type: 'combobox',
    active: '',
    placeholder: 'app.enter.select.postJob',
    validation: VALIDATE_ALPHANUMERIC,
    available: []
  },
  ////////////////////////////////////////////////////////////////////////////////////
  ///////////////////////  clusters  /////////////////////////////////////
  {
    id: 'clusterSection',
    type: 'section',
    title: 'creation.app.placement.rule',
    overline: true,
    collapsable: true,
    collapsed: false
  },
  {
    id: existingRuleCheckbox,
    type: 'hidden',
    name: 'creation.app.settings.existingRule',
    tooltip: 'tooltip.creation.app.settings.existingRule',
    onSelect: updateDisplayForPlacementControls,
    active: false,
    available: [],
    validation: {}
  },
  {
    name: 'creation.app.exitingRuleCombo',
    tooltip: 'tooltip.creation.app.exitingRuleCombo',
    id: 'placementrulecombo',
    type: 'hidden',
    fetchAvailable: loadExistingPlacementRules(),
    onSelect: updateNewRuleControls,
    validation: {}
  },
  {
    id: 'selectedRuleName',
    type: 'hidden',
    active: ''
  },
  {
    id: localClusterCheckbox,
    type: 'checkbox',
    name: 'creation.app.settings.localClusters',
    tooltip: 'tooltip.creation.app.settings.localClusters',
    onSelect: updatePlacementControls,
    active: false,
    available: []
  },
  {
    id: 'online-cluster-only-checkbox',
    type: 'checkbox',
    name: 'creation.app.settings.onlineClusters',
    tooltip: 'tooltip.creation.app.settings.onlineClusters',
    active: false,
    available: []
  },
  {
    type: 'custom',
    id: 'clusterSelector',
    component: <ClusterSelector />,
    available: []
  },
  {
    name: 'creation.app.settings.clustersReplica',
    tooltip: 'tooltip.creation.app.settings.clustersReplica',
    id: 'clusterReplicas',
    type: 'text',
    active: '',
    placeholder: 'creation.app.settings.ph.clustersReplica',
    available: [],
    validation: {}
  },
  ////////////////////////////////////////////////////////////////////////////////////
  ///////////////////////  settings  /////////////////////////////////////
  {
    id: 'settingsSection',
    type: 'section',
    title: 'creation.app.section.settings',
    overline: true,
    collapsable: true,
    collapsed: false
  },
  {
    type: 'custom',
    name: 'creation.app.settings.timeWindow',
    tooltip: 'creation.app.settings.timeWindow.tooltip',
    id: 'timeWindow',
    component: <TimeWindow />,
    available: []
  }
]

const objectstoreChannelData = [
  ///////////////////////  Objectstore  /////////////////////////////////////
  {
    id: 'channelName',
    type: 'hidden',
    active: 'resource'
  },
  {
    id: 'channelNamespace',
    type: 'hidden',
    active: ''
  },
  {
    name: 'creation.app.objectstore.url',
    tooltip: 'tooltip.creation.app.objectstore.url',
    id: 'objectstoreURL',
    type: 'combobox',
    active: '',
    placeholder: 'app.enter.select.objectstore.url',
    available: [],
    validation: VALIDATE_URL,
    fetchAvailable: loadExistingChannels('objectbucket'),
    onSelect: updateChannelControls
  },
  {
    name: 'creation.app.objectstore.accesskey',
    tooltip: 'tooltip.creation.app.objectstore.accesskey',
    id: 'accessKey',
    type: 'text',
    active: '',
    encode: true,
    placeholder: 'app.enter.accesskey'
  },
  {
    name: 'creation.app.objectstore.secretkey',
    tooltip: 'tooltip.creation.app.objectstore.secretkey',
    id: 'secretKey',
    type: 'text',
    encode: true,
    active: '',
    placeholder: 'app.enter.secretkey'
  },
  ////////////////////////////////////////////////////////////////////////////////////
  ///////////////////////  pre/post jobs  /////////////////////////////////////
  {
    id: 'perPostSection',
    type: 'section',
    title: 'creation.app.section.prePost',
    overline: true,
    collapsable: true,
    collapsed: false
  },
  {
    name: 'creation.app.pre.job',
    tooltip: 'tooltip.creation.app.preJob',
    id: 'preJob',
    type: 'combobox',
    active: '',
    placeholder: 'app.enter.select.preJob',
    validation: VALIDATE_ALPHANUMERIC,
    available: []
  },
  {
    name: 'creation.app.post.job',
    tooltip: 'tooltip.creation.app.postJob',
    id: 'postJob',
    type: 'combobox',
    active: '',
    placeholder: 'app.enter.select.postJob',
    validation: VALIDATE_ALPHANUMERIC,
    available: []
  },
  ////////////////////////////////////////////////////////////////////////////////////
  ///////////////////////  clusters  /////////////////////////////////////
  {
    id: 'clusterSection',
    type: 'section',
    title: 'creation.app.placement.rule',
    overline: true,
    collapsable: true,
    collapsed: false
  },
  {
    id: existingRuleCheckbox,
    type: 'hidden',
    name: 'creation.app.settings.existingRule',
    tooltip: 'tooltip.creation.app.settings.existingRule',
    onSelect: updateDisplayForPlacementControls,
    active: false,
    available: [],
    validation: {}
  },
  {
    name: 'creation.app.exitingRuleCombo',
    tooltip: 'tooltip.creation.app.exitingRuleCombo',
    id: 'placementrulecombo',
    type: 'hidden',
    fetchAvailable: loadExistingPlacementRules(),
    onSelect: updateNewRuleControls,
    validation: {}
  },
  {
    id: 'selectedRuleName',
    type: 'hidden',
    active: ''
  },
  {
    id: localClusterCheckbox,
    type: 'checkbox',
    name: 'creation.app.settings.localClusters',
    tooltip: 'tooltip.creation.app.settings.localClusters',
    onSelect: updatePlacementControls,
    active: false,
    available: []
  },
  {
    id: 'online-cluster-only-checkbox',
    type: 'checkbox',
    name: 'creation.app.settings.onlineClusters',
    tooltip: 'tooltip.creation.app.settings.onlineClusters',
    active: false,
    available: []
  },
  {
    type: 'custom',
    id: 'clusterSelector',
    component: <ClusterSelector />,
    available: []
  },
  {
    name: 'creation.app.settings.clustersReplica',
    tooltip: 'tooltip.creation.app.settings.clustersReplica',
    id: 'clusterReplicas',
    type: 'text',
    active: '',
    placeholder: 'creation.app.settings.ph.clustersReplica',
    available: [],
    validation: {}
  },
  ////////////////////////////////////////////////////////////////////////////////////
  ///////////////////////  settings  /////////////////////////////////////
  {
    id: 'settingsSection',
    type: 'section',
    title: 'creation.app.section.settings',
    overline: true,
    collapsable: true,
    collapsed: false
  },
  {
    type: 'custom',
    name: 'creation.app.settings.timeWindow',
    tooltip: 'creation.app.settings.timeWindow.tooltip',
    id: 'timeWindow',
    component: <TimeWindow />,
    available: []
  }
]

export const controlData = [
  {
    id: 'main',
    type: 'section',
    note: 'creation.view.required.mark'
  },
  {
    name: 'creation.app.name',
    tooltip: 'tooltip.creation.app.name',
    id: 'name',
    type: 'text',
    validation: {
      constraint: VALID_DNS_LABEL,
      notification: 'import.form.invalid.dns.label',
      required: true
    }
  },
  {
    name: 'creation.app.namespace',
    tooltip: 'tooltip.creation.app.namespace',
    id: 'namespace',
    type: 'combobox',
    fetchAvailable: loadExistingNamespaces(),
    onSelect: updateNSControls,
    validation: {
      constraint: VALID_DNS_LABEL,
      notification: 'import.form.invalid.dns.label',
      required: true
    }
  },
  {
    id: 'userDefinedNamespace',
    type: 'hidden',
    active: ''
  },
  ////////////////////////////////////////////////////////////////////////////////////
  ///////////////////////  channels  /////////////////////////////////////
  {
    id: 'channelSection',
    type: 'section',
    title: 'creation.app.channels',
    overline: true,
    collapsable: true,
    collapsed: false
  },
  ///////////////////////  channels  /////////////////////////////////////
  {
    id: 'channels',
    type: 'group',
    prompts: {
      nameId: 'channelPrompt',
      baseName: 'resource',
      addPrompt: 'creation.app.add.channel',
      deletePrompt: 'creation.app.delete.channel'
    },
    controlData: [
      {
        id: 'channel',
        type: 'section',
        title: 'creation.app.channel.title',
        collapsable: true,
        collapsed: false
      },
      ///////////////////////  channel name  /////////////////////////////////////
      {
        id: 'channelPrompt',
        type: 'hidden',
        active: ''
      },
      {
        id: 'channelType',
        type: 'cards',
        sort: false,
        collapseCardsControlOnSelect: true,
        scrollViewToTopOnSelect: true,
        title: 'creation.app.channel.type',
        collapsable: true,
        collapsed: false,
        available: [
          {
            id: 'github',
            logo: 'git-repo.svg',
            title: 'creation.app.channel.github',
            tooltip: 'tooltip.creation.app.channel.git',
            change: {
              insertControlData: githubChannelData
            }
          },
          {
            id: 'deployable',
            logo: 'namespace-repo.svg',
            title: 'creation.app.channel.deployable',
            tooltip: 'tooltip.creation.app.channel.namespace',
            change: {
              insertControlData: hubClusterChannelData
            }
          },
          {
            id: 'helmrepo',
            logo: 'helm-repo.png',
            title: 'creation.app.channel.helmrepo',
            tooltip: 'tooltip.creation.app.channel.helmrepo',
            change: {
              insertControlData: helmReleaseChannelData
            }
          },
          {
            id: 'objectstore',
            logo: 'object-bucket-repo.svg',
            title: 'creation.app.channel.objectstore',
            tooltip: 'tooltip.creation.app.channel.objectstore',
            change: {
              insertControlData: objectstoreChannelData
            }
          }
        ],
        active: '',
        validation: {}
      }
    ]
  }
]
