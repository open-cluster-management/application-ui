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

import { ControlMode, parseYAML } from './source-utils'
import msgs from '../../../../nls/platform.properties'
import _ from 'lodash'

export function updateControls(
  editors,
  templateYAML,
  otherYAMLTabs = [],
  controlData,
  isFinalValidate,
  locale
) {
  // parse all yamls
  let { parsed, exceptions } = parseYAML(templateYAML)
  const templateObjectMap = { '<<main>>': parsed }
  const templateExceptionMap = {
    '<<main>>': {
      editor: editors[0],
      exceptions: attachEditorToExceptions(exceptions, editors, 0)
    }
  }
  otherYAMLTabs.forEach(({ id, templateYAML: yaml }, inx) => {
    ({ parsed, exceptions } = parseYAML(yaml))
    templateObjectMap[id] = parsed
    templateExceptionMap[id] = {
      editor: editors[inx + 1],
      exceptions: attachEditorToExceptions(exceptions, editors, inx + 1)
    }
  })

  // if any syntax errors, report them and leave
  let hasSyntaxExceptions = false
  Object.values(templateExceptionMap).forEach(({ exceptions: _exceptions }) => {
    if (_exceptions.length > 0) {
      hasSyntaxExceptions = true
    }
  })

  // get values from parsed yamls using source paths and verify values are valid
  if (!hasSyntaxExceptions) {
    let stopValidating = false
    controlData.forEach(control => {
      const {
        type,
        active = [],
        pauseControlCreationHereUntilSelected
      } = control
      delete control.exception
      if (!stopValidating) {
        switch (type) {
        case 'group':
          updateGroupControl(
            active,
            controlData,
            templateObjectMap,
            templateExceptionMap,
            isFinalValidate,
            locale
          )
          break

        case 'table':
          control.exceptions = []
          updateTableControl(
            control,
            templateObjectMap,
            templateExceptionMap,
            isFinalValidate,
            locale
          )
          break

        default:
          updateControl(
            control,
            controlData,
            templateObjectMap,
            templateExceptionMap,
            isFinalValidate,
            locale
          )
          break
        }
      }
      if (pauseControlCreationHereUntilSelected) {
        stopValidating = !active
      }
    })
  }

  // update editors with any format exceptions
  let hasValidationExceptions = false
  Object.values(templateExceptionMap).forEach(
    ({ editor, exceptions: _exceptions }, inx) => {
      setTimeout(() => {
        if (editor) {
          const decorationList = []
          _exceptions.forEach(({ row, text }) => {
            decorationList.push({
              range: new editor.monaco.Range(row, 0, row, 132),
              options: {
                isWholeLine: true,
                glyphMarginClassName: 'errorDecoration',
                glyphMarginHoverMessage: { value: text },
                minimap: { color: 'red', position: 1 }
              }
            })
          })
          _exceptions.forEach(({ row, column }) => {
            decorationList.push({
              range: new editor.monaco.Range(row, column - 6, row, column + 6),
              options: {
                className: 'squiggly-error'
              }
            })
          })
          editor.errorList = decorationList
          editor.decorations = editor.deltaDecorations(editor.decorations, [
            ...editor.errorList,
            ...(editor.changeList || [])
          ])
        }
      }, 0)
      if (_exceptions.length > 0) {
        hasValidationExceptions = true
        attachEditorToExceptions(_exceptions, editors, inx)
      }
    }
  )
  return {
    templateObjectMap,
    templateExceptionMap,
    hasSyntaxExceptions,
    hasValidationExceptions
  }
}

const updateGroupControl = (
  group,
  parentControlData,
  templateObjectMap,
  templateExceptionMap,
  isFinalValidate,
  locale
) => {
  group.forEach(controlData => {
    controlData.forEach(control => {
      delete control.exception
      updateControl(
        control,
        parentControlData,
        templateObjectMap,
        templateExceptionMap,
        isFinalValidate,
        locale
      )
    })
  })
}

const updateTableControl = (
  table,
  templateObjectMap,
  templateExceptionMap,
  isFinalValidate,
  locale
) => {
  const {
    active: rows,
    controlData,
    sourcePath: { tabId = '<<main>>', paths },
    validation: { tester },
    exceptions
  } = table
  const controlDataMap = _.keyBy(controlData, 'id')
  let hidden = false
  rows.forEach((row, inx) => {
    const pathMap = paths[inx]
    Object.entries(row).forEach(([key, active]) => {
      if (
        controlDataMap[key] &&
        (typeof active !== 'string' || !active.trim().startsWith('#'))
      ) {
        const control = {
          ...controlDataMap[key],
          sourcePath: { tabId, path: pathMap ? pathMap[key] : '' },
          active
        }
        updateControl(
          control,
          controlData,
          templateObjectMap,
          templateExceptionMap,
          isFinalValidate,
          locale
        )
        row[key] = control.active
        const promptOnly = control.mode === ControlMode.PROMPT_ONLY
        if (control.exception) {
          // add exception to cell in table
          let exception = exceptions.find(
            ({ exception: _exception }) => _exception === control.exception
          )
          if (!exception) {
            exception = {
              exception: control.exception,
              cells: []
            }
            exceptions.push(exception)
          }
          if (!promptOnly) {
            exception.cells.push(`${key}-${row.id}`)
          } else {
            hidden = true
          }
        }
      }
    })
  })
  if (exceptions.length > 0) {
    table.exception = msgs.get(
      `creation.ocp.validation.errors${hidden ? '.hidden' : ''}`,
      locale
    )
  } else if (typeof tester === 'function') {
    const exception = tester(rows)
    if (exception) {
      table.exception = msgs.get(exception, locale)
    }
  }
}

const updateControl = (
  control,
  controlData,
  templateObjectMap,
  templateExceptionMap,
  isFinalValidate,
  locale
) => {
  // if final validation before creating template, if this value is required, throw error
  const { type, hidden } = control
  if (typeof hidden === 'function' && hidden(control, controlData)) {
    return
  }
  if ((isFinalValidate || type === 'number') && control.validation) {
    const {
      name,
      active,
      validation: { required, notification },
      ref
    } = control
    if (required && (!active || (type === 'cards' && active.length === 0))) {
      const msg =
        notification ? notification : 'creation.missing.input'
      control.exception = msgs.get(msg, [name], locale)
      const { sourcePath } = control
      if (sourcePath) {
        const { tabId, path } = sourcePath
        const parsed = templateObjectMap[tabId]
        const { exceptions } = templateExceptionMap[tabId]
        const spath = splitPath(path)
        exceptions.push({
          row: getRow(spath, parsed),
          column: 0,
          text: control.exception,
          type: 'error',
          ref
        })
      }
      return
    }
  }

  if (shouldUpdateControl(control, templateObjectMap)) {
    switch (control.type) {
    case 'text':
    case 'textarea':
    case 'number':
    case 'combobox':
    case 'toggle':
    case 'hidden':
      updateTextControl(
        control,
        templateObjectMap,
        templateExceptionMap,
        isFinalValidate,
        locale
      )
      break
    case 'checkbox':
      updateCheckboxControl(
        control,
        templateObjectMap,
        templateExceptionMap,
        locale
      )
      break
    case 'cards':
      updateCardsControl(
        control,
        templateObjectMap,
        templateExceptionMap,
        locale
      )
      break
    case 'singleselect':
      updateSingleSelectControl(
        control,
        templateObjectMap,
        templateExceptionMap,
        locale
      )
      break
    case 'multiselect':
      updateMultiSelectControl(
        control,
        templateObjectMap,
        templateExceptionMap,
        locale
      )
      break
    case 'table':
      updateTableControl(
        control,
        templateObjectMap,
        templateExceptionMap,
        locale
      )
      break
    }
  }
}

const attachEditorToExceptions = (exceptions, editors, inx) => {
  return exceptions.map(exception => {
    exception.editor = editors[inx]
    exception.tabInx = inx
    return exception
  })
}

const shouldUpdateControl = (control, templateObjectMap) => {
  let required = false
  const { sourcePath, validation, active } = control
  if (sourcePath && validation) {
    ({ required } = validation)
    if (!required) {
      // if not required, only validate if that yaml path exists
      const { tabId, path } = sourcePath
      const parsed = templateObjectMap[tabId]
      return !!_.get(parsed, path) || !!active
    }
  }
  return required
}

const updateTextControl = (
  control,
  templateObjectMap,
  templateExceptionMap,
  isFinalValidate,
  locale
) => {
  const {
    id,
    name,
    sourcePath: { tabId, path },
    validation: { contextTester, tester, notification },
    template,
    ref
  } = control
  const parsed = templateObjectMap[tabId]
  let active = _.get(parsed, path)
  if (typeof active === 'number') {
    active = active.toString()
  }
  // ex: text input is in the form of a uri
  if (active && template) {
    const parts = template.split(`{{{${id}}}}`)
    active = active.replace(parts[0], '')
    if (parts.length > 1) {
      active = active.replace(new RegExp(parts[1] + '$'), '')
    }
  }
  control.active = active
  const { exceptions } = templateExceptionMap[tabId]
  const spath = splitPath(path)
  if (active === undefined) {
    addException(spath, parsed, exceptions, locale)
  } else if (active || isFinalValidate) {
    let exception
    if (active) {
      if (contextTester) {
        exception = contextTester(active, templateObjectMap, locale)
      } else if (tester && !tester.test(active)) {
        if (active.length > 50) {
          active = `${active.substr(0, 25)}...${active.substr(-25)}`
        }
        exception = msgs.get(notification, [active], locale)
      }
    } else {
      exception = msgs.get('validation.missing.value', [name], locale)
    }
    if (exception) {
      control.exception = exception
      exceptions.push({
        row: getRow(spath, parsed),
        column: 0,
        text: exception,
        type: 'error',
        ref
      })
    }
  }
  if (tester) {
    tester.lastIndex = 0
  }
}

const updateSingleSelectControl = (
  control,
  templateObjectMap,
  templateExceptionMap,
  locale
) => {
  const { available = [], sourcePath = {} } = control
  const { tabId = '<<main>>', path = '' } = sourcePath
  const parsed = templateObjectMap[tabId]
  const active = _.get(parsed, path)
  control.active = active
  const { exceptions } = templateExceptionMap[tabId]
  const spath = splitPath(path)
  if (!active) {
    addException(spath, parsed, exceptions, locale)
  } else if (
    available.findIndex(avail => active.indexOf(avail) !== -1) === -1
  ) {
    control.exception = msgs.get(
      'validation.bad.value',
      [active, _.get(control, 'available')],
      locale
    )
    exceptions.push({
      row: getRow(spath, parsed),
      column: 0,
      text: control.exception,
      type: 'error'
    })
  }
}

const updateCardsControl = (
  control,
  templateObjectMap,
  templateExceptionMap,
  locale
) => {
  const { active, validation: { required, notification } } = control
  if (required && !active) {
    control.exception = msgs.get(notification, locale)
  }
}

const updateCheckboxControl = (
  control,
  templateObjectMap,
  templateExceptionMap,
  locale
) => {
  const { available, sourcePath: { tabId, path } } = control
  const parsed = templateObjectMap[tabId]
  let active = _.get(parsed, path)
  const { exceptions } = templateExceptionMap[tabId]
  const spath = splitPath(path)
  if (!active) {
    addException(spath, parsed, exceptions, locale)
  }
  if (available.indexOf(active) === -1) {
    control.exception = msgs.get(
      'validation.bad.value',
      [getKey(spath), available.join(', ')],
      locale
    )
    exceptions.push({
      row: getRow(spath, parsed),
      column: 0,
      text: control.exception,
      type: 'error'
    })
  }
  if (typeof active == 'boolean') {
    active = available.indexOf(active.toString()) > 0
  } else {
    active = available.indexOf(active) > 0
  }
  control.active = active
}

const updateMultiSelectControl = (
  control,
  templateObjectMap,
  templateExceptionMap,
  locale
) => {
  const { hasKeyLabels, hasReplacements } = control
  if (hasKeyLabels) {
    updateMultiSelectLabelControl(
      control,
      templateObjectMap,
      templateExceptionMap,
      locale
    )
  } else if (hasReplacements) {
    updateMultiSelectReplacementControl(
      control,
      templateObjectMap,
      templateExceptionMap,
      locale
    )
  } else {
    updateMultiSelectStringControl(
      control,
      templateObjectMap,
      templateExceptionMap,
      locale
    )
  }
}

const updateMultiSelectStringControl = (
  control,
  templateObjectMap,
  templateExceptionMap,
  locale
) => {
  const { available, sourcePath: { tabId, path } } = control
  const parsed = templateObjectMap[tabId]
  let values = _.get(parsed, path)
  if (values) {
    if (typeof values === 'object') {
      values = values.map(({ $v }) => {
        return $v
      })
    } else if (typeof values === 'string') {
      values = values
        .split(',')
        .map(item => {
          return item.trim()
        })
        .filter(v => {
          return v !== ''
        })
    }
    const set = new Set(available)
    control.userData = values.filter(value => {
      return !set.has(value)
    })
  } else {
    values = []
  }
  control.active = values
  const { exceptions } = templateExceptionMap[tabId]
  if (values == null) {
    const spath = splitPath(path)
    addException(spath, parsed, exceptions, locale)
  }
}

const updateMultiSelectLabelControl = (
  control,
  templateObjectMap,
  templateExceptionMap,
  locale
) => {
  const { sourcePath: { tabId, path } } = control
  const parsed = templateObjectMap[tabId]
  const { exceptions } = templateExceptionMap[tabId]
  const selectors = []
  const userData = []
  const userMap = {}
  const { availableMap } = control
  const matchExpressions = _.get(parsed, path)
  if (matchExpressions instanceof Object) {
    matchExpressions.forEach(({ key, operator, values }) => {
      if (operator === 'In') {
        values.forEach(value => {
          const selection = `${key}: "${value}"`
          selectors.push(selection)
          if (!availableMap[selection]) {
            userMap[selection] = { key, value }
            userData.push(selection)
          }
        })
      }
    })
  }
  if (userData.length > 0) {
    control.userData = userData
    control.userMap = userMap
  }
  control.active = selectors

  if (!control.active) {
    const spath = splitPath(path)
    addException(spath, parsed, exceptions, locale)
  }
}

const updateMultiSelectReplacementControl = (
  control,
  templateObjectMap,
  templateExceptionMap,
  locale
) => {
  const { sourcePath: { tabId, path } } = control
  const parsed = templateObjectMap[tabId]
  const { exceptions } = templateExceptionMap[tabId]
  const hasOne = path.some(p => {
    return !!_.get(parsed, p)
  })
  if (!hasOne) {
    const spath = splitPath(path)
    addException(spath, parsed, exceptions, locale)
  }
}

const addException = (path, parsed, exceptions, locale) => {
  let exceptionAdded = false
  do {
    const lastPop = path.pop()
    if (!!_.get(parsed, path.join('.')) || path.length <= 1) {
      // create exception
      path.push(lastPop)
      const missingKey = getKey(path).replace(/^unknown\./, '')
      exceptions.push({
        row: getRow(path, parsed),
        column: 0,
        text: msgs.get('validation.missing.resource', [missingKey], locale),
        type: 'error'
      })
      exceptionAdded = true
    }
  } while (!exceptionAdded)
}

// split and join taking into account sss[.fff] in path
const splitPath = path => {
  return path.split(/\.(?![^[]*\])/)
}
const joinPath = path => {
  return path
    .map(s => {
      return s.indexOf('$v[') === -1 ? s.replace('[', '.$v[') : s
    })
    .join('.')
}

const getKey = path => {
  return path
    .join('.')
    .replace('.$synced', '')
    .replace('[0]', '')
    .replace(/\.\$v/g, '')
}

const getRow = (path, parsed) => {
  let synced
  if (path.length > 0) {
    const pathBase = path.shift()
    path = path.length > 0 ? pathBase + `.${joinPath(path)}` : pathBase
    path = splitPath(path)
    do {
      synced = _.get(parsed, path.join('.'))
      path.pop()
    } while (
      path.length > 0 &&
      (synced === undefined || synced === null || synced.$r === undefined)
    )
  }
  return synced ? synced.$r + 1 : 0
}
