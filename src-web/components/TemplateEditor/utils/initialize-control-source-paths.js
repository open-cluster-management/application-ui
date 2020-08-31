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

import { getInsideObject } from './source-utils'
import { generateSourceFromTemplate } from './refresh-source-from-templates'
import _ from 'lodash'


export const initializeControlSourcePaths = (template, controlData) => {
  setSectionSourcePaths(template, _.cloneDeep(controlData), _.keyBy(controlData, 'id'))
}

const setSectionSourcePaths = (template, controlData, controlMap, parentData, childrenData) => {
  const groups = []
  const choices = [];

  // set control.active to proxies such that when run through
  // the handlebars template, the yaml is returned with markers (<<<controlId>>>)
  // where the active value would have been placed
  (childrenData||controlData).forEach(control => {
    switch (control.type) {
    case 'section':
      break

    case 'group':
      groups.push(control)
      break

    case 'cards':
      choices.push(control)
      break

    default:
      control.active =  new Proxy({}, {
        get: (target, prop) => {//}, receiver) => {
          //          console.log(typeof prop)
          //          console.log(prop.toString())
          //          console.log(control.type)
          //          const value = control.actived
          //          if (typeof value === 'object') {
          //            var tt = Reflect.get(value, prop)
          //            return tt;
          //          }
          //
          //          var tr = {...arguments}
          //          var ww = Reflect.get(...arguments)

          // nested property was specified (controlId.property)
          if (typeof prop === 'string') {
            return `<<<${control.id}.${prop}>>>`
            //return ()=> {
            //  return `<<<${control.id}.${prop}>>>`
            //}
          } else {
            return ()=> {
              return `<<<${control.id}>>>`
            }
          }
        },
        // allow all control nested properties to be processed
        getOwnPropertyDescriptor() {
          return {
            configurable: true,
            enumerable: true
          }
        }
      })
      break
    }
  })

  // get templateObject with markers
  const {templateObject} = generateSourceFromTemplate(template, controlData)

  // flatten and invert templateObject
  const flattenedTemplateObject = flattenObject(getInsideObject('$raw', templateObject))

  // set source paths into controls
  setControlSourcePaths(flattenedTemplateObject, controlMap)

  // process the inner controlData of groups
  setGroupSourcePaths(groups, template, controlData, controlMap)

  // process the inner controlData of groups
  setChoicesSourcePaths(choices, template, controlData, controlMap, parentData)
}

// set the source paths in the controls in a group
const setGroupSourcePaths = (groups, template, controlData, controlMap) => {
  groups.forEach(group=>{

    const groupData = _.cloneDeep(group.controlData)
    group.active = [groupData]
    setSectionSourcePaths(template, controlData, controlMap, groupData, groupData)

  })
}

// set the source paths for each option of a control with choices (ex: cards)
const setChoicesSourcePaths = (choices, template, controlData, controlMap, parentData) => {
  choices.forEach(control=>{

    control.available.forEach(choice=>{
      const {id, change:{insertControlData}} = choice

      control.active = id
      parentData.push(...insertControlData)
      setSectionSourcePaths(template, controlData, controlMap, parentData, insertControlData)

    })

  })
}

// find the markers in the source, convert back to {{{ }}} and add paths/markers to each control
const setControlSourcePaths = (flattenedTemplateObject, controlMap) => {
  Object.entries(_.invertBy(flattenedTemplateObject)).forEach(([snip, sourcePaths])=>{
    const controlIds = []
    snip = snip.replace(/<<<(.*?)>>>/g, (match, capture) => {
      controlIds.push(capture)
      return `{{{${capture}}}}`
    })
    if (controlIds.length) {
      const controlId = controlIds[0].split('.')[0]
      const control = controlMap[controlId]
      if (control) {
        let srcPaths = _.get(control, 'sourcePath', [])
        srcPaths = [...srcPaths, ...sourcePaths.map((path)=>{return {path, snip}})]
        _.set(control, 'sourcePath', srcPaths)
      } else {
        // eslint-disable-next-line no-console
        console.error(`template contains ID that is not in controls: ${controlId}`)
      }
    }
  })
}

// return {a: {b: c}} as 'a.b: c'
const flattenObject = (obj) => {
  const ret = {}
  _.forOwn(obj, (obj1, key1) => {
    if (typeof obj1 === 'object' && obj1 !== null) {
      const flatObject = flattenObject(obj1)
      _.forOwn(flatObject, (obj2, key2) => {
        ret[key1 + '.' + key2] = obj2
      })
    } else {
      ret[key1] = obj1
    }
  })
  return ret
}
