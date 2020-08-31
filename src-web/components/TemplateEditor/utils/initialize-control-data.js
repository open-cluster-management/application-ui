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

import msgs from '../../../../nls/platform.properties'
import _ from 'lodash'

///////////////////////////////////////////////////////////////////////////////
// intialize controls and groups
///////////////////////////////////////////////////////////////////////////////
export const initializeControlData = (
  initialControlData,
  locale,
  groupNum,
  inGroup
) => {
  const parentControlData = initialControlData.map(control => {
    const { type, controlData, groupCnt = 1 } = control
    switch (type) {
    case 'group': {
      let active = control.active
      if (!active) {
        active = control.active = []
      }
      while (active.length < groupCnt) {
        active.push(
          initializeControlData(controlData, locale, active.length + 1, true)
        )
      }
      return control
    }
    default:
      return initialControl(control, locale, groupNum)
    }
  })

  // if any card controls, set this as parent control data
  if (inGroup) {
    parentControlData.forEach(c => {
      if (c.type === 'cards') {
        c.groupNum = groupNum
        c.groupControlData = parentControlData
      }
    })
  }
  return parentControlData
}

///////////////////////////////////////////////////////////////////////////////
// initialze each control
///////////////////////////////////////////////////////////////////////////////
const initialControl = (control, locale, groupNum) => {
  const { type, isInitialized } = control
  if (!isInitialized) {
    control = Object.assign({}, control)

    // initialize control's active value
    initializeControlActive(type, control)

    // initialize user data if control's available choices were cached
    initializeControlUserData(control)

    // convert i18n message keys to messages
    initializeMsgs(control, locale, groupNum)

    // intialize choices available for a control
    initializeAvailableChoices(type, control)

    // initialize validation methods
    initializeValidation(type, control)

    control.isInitialized = true
  }
  return control
}

const initializeControlActive = (type, control) => {
  const { active, available = [] } = control
  switch (type) {
  case 'checkbox':
    control.active = available.indexOf(active) > 0
    break
  case 'number':
    control.active = control.initial
    break

  default:
    break
  }
}

const initializeControlUserData = (control) => {
  //if user data was cached, apply now
  //save custom user input for session??
  if (control.cacheUserValueKey) {
    const storageKey = `${control.cacheUserValueKey}--${
      window.location.href
    }`
    const sessionObject = JSON.parse(sessionStorage.getItem(storageKey))
    if (sessionObject) {
      control.userData = sessionObject
    }
  }
}

//don't save user data until they create
export const cacheUserData = controlData => {
  controlData.forEach(control => {
    if (
      control.cacheUserValueKey &&
    control.userData &&
    control.userData.length > 0
    ) {
      const storageKey = `${control.cacheUserValueKey}--${
        window.location.href
      }`
      sessionStorage.setItem(storageKey, JSON.stringify(control.userData))
    }
  })
}

const initializeMsgs = (control, locale, groupNum) => {
  const { type, controlData, available } = control
  const keys = [
    'name',
    'description',
    'placeholder',
    'title',
    'subtitle',
    'prompt',
    'info',
    'tooltip'
  ]
  keys.forEach(key => {
    if (typeof control[key] === 'string') {
      control[key] = groupNum
        ? msgs.get(control[key], [groupNum], locale)
        : msgs.get(control[key], locale)
    }
  })
  const properties = ['available', 'active']
  properties.forEach(prop => {
    const values = _.get(control, prop)
    if (Array.isArray(values)) {
      values.forEach(item => {
        keys.forEach(key => {
          if (item[key] && item[key].split('.').length > 2) {
            if (typeof item[key] === 'string') {
              item[key] = msgs.get(item[key], locale)
            }
          }
        })
      })
    }
  })

  // if table convert the controlData in that
  if (type === 'table' && controlData) {
    controlData.forEach(ctrl => {
      if (!ctrl.isInitialized) {
        initializeMsgs(ctrl, locale, groupNum)
        ctrl.isInitialized = true
      }
    })
  }

  // if cards convert the data in that
  if (type === 'cards' && available) {
    available.forEach(({ change = {} }) => {
      if (change.insertControlData) {
        change.insertControlData.forEach(ctrl => {
          if (!ctrl.isInitialized) {
            initializeMsgs(ctrl, locale, groupNum)
            ctrl.isInitialized = true
          }
        })
      }
    })
  }
}

const initializeAvailableChoices = (type, control) => {
  const { multiselect } = control
  //if available choices are objects, convert to keys
  //required for label lists, multiselect, cards
  let sortAvailableChoices = true
  let sortLabelsByName = false
  let availableMap = {}

  if (
    type !== 'table' &&
   type !== 'treeselect' &&
   typeof _.get(control, 'available[0]') === 'object'
  ) {
    const { sort = true } = control
    availableMap = control.availableMap = {}
    sortAvailableChoices = sort
    control.available = control.available.map(choice => {
      let availableKey
      const {
        id,
        key,
        value,
        name,
        description,
        replacements,
        change = {}
      } = choice
      // label choices
      if (key && value) {
        availableKey = `${key}: "${value}"`
        sortLabelsByName = control.hasKeyLabels = true
      } else if (value && description) {
        availableKey = `${value} - ${description}`
        sortLabelsByName = control.hasValueDescription = true
        choice = choice.value
      } else if (name && description) {
        // multiselect choices
        availableKey = `${name} - ${description}`
        control.hasReplacements = true
      } else if (id) {
        // card choices
        availableKey = id
        const replaces = replacements || change.replacements
        control.hasReplacements = control.hasReplacements || !!replaces
        if (control.hasReplacements) {
          choice.replacements = replaces
        }
        control.newEditorMode =
         change.insertControlData && type === 'cards' && !multiselect
      }
      control.availableMap[availableKey] = choice
      return availableKey
    })
    if (sortAvailableChoices) {
      control.available = control.available.sort((a, b) => {
        switch (type) {
        case 'cards':
          a = availableMap[a].title || a
          b = availableMap[b].title || b
          break
        }
        if (sortLabelsByName) {
          const aw = a.startsWith('name')
          const bw = b.startsWith('name')
          if (aw && !bw) {
            return 1
          } else if (!aw && bw) {
            return -1
          }
        }
        return a.localeCompare(b)
      })
    }
  }
}

const initializeValidation = (type, control) => {
//connect controls to source for updates/validation
  const { validation, multiline } = control
  if (validation) {
    let { constraint } = validation
    if (constraint) {
      if (multiline) {
        validation.tester = new RegExp(constraint)
      } else {
        if (!constraint.startsWith('^')) {
          constraint = '^' + constraint
        }
        if (!constraint.endsWith('$')) {
          constraint = constraint + '$'
        }
        validation.tester = new RegExp(constraint)
      }
    } else if (validation.json) {
      validation.tester = {
        test: function(value) {
          try {
            JSON.parse(value)
            return true
          } catch (e) {
            return false
          }
        }
      }
    }
  }
}

