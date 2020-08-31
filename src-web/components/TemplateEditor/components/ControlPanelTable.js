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
import PropTypes from 'prop-types'
import {
  PaginationV2,
  DropdownV2,
  ToggleSmall,
  DataTable,
  DataTableSkeleton,
  Notification,
  Icon
} from 'carbon-components-react'
import msgs from '../../../../nls/platform.properties'
import { ControlMode } from '../../TemplateEditor/utils/source-utils'
import '../../../../graphics/diagramIcons.svg'
import _ from 'lodash'

const {
  TableContainer,
  TableToolbar,
  TableToolbarSearch,
  TableToolbarContent,
  Table,
  TableHead,
  TableRow,
  TableSelectRow,
  TableSelectAll,
  TableBody,
  TableCell
} = DataTable

const translateWithId = (locale, id) => msgs.get(id, locale)

const add = 'table.actions.add'
const remove = 'table.actions.remove'
const edit = 'table.actions.edit'

const PAGE_SIZES = {
  DEFAULT: 5,
  VALUES: [5, 10, 20, 50, 75, 100]
}

class ControlPanelTable extends React.Component {
  static propTypes = {
    control: PropTypes.object,
    handleChange: PropTypes.func,
    locale: PropTypes.string
  };

  static getDerivedStateFromProps(props, state) {
    const { control } = props
    const { id, isLoaded, available } = control
    const { pageSize } = state
    localStorage.setItem(`table-${id}-page-size`, pageSize)
    if (isLoaded && !state.originalSet) {
      return { originalSet: new Set(Object.keys(_.keyBy(available, 'id'))) }
    }
    return null
  }

  constructor(props) {
    super(props)
    const { control: { id, controlData } } = props
    this.state = {
      pageSize:
        parseInt(localStorage.getItem(`table-${id}-page-size`), 10) ||
        PAGE_SIZES.DEFAULT,
      sortDirection: 'asc',
      searchValue: ''
    }
    this.headerMap = _.keyBy(controlData, 'id')
  }

  getHeaders() {
    const { control: { controlData } } = this.props
    const headers = controlData
      .filter(({ mode }) => mode !== ControlMode.PROMPT_ONLY)
      .map(({ id, name }) => ({ key: id, header: name }))
    headers.push({ key: 'action', header: '' })
    return headers
  }

  getRows() {
    const { locale, control } = this.props
    const { prompts = {}, sortTable, active } = control
    const { deletePrompt = '' } = prompts
    const text = msgs.get(deletePrompt, locale)
    const { controlData, available = [] } = control
    const columns = controlData
      .filter(({ mode }) => mode !== ControlMode.PROMPT_ONLY)
      .map(({ id }) => ({ key: id }))
    const { selectedKey, sortDirection, searchValue } = this.state
    let items = _.cloneDeep(available)
    if (selectedKey) {
      items = sortTable
        ? sortTable(items, selectedKey, sortDirection, active)
        : _.orderBy(items, [selectedKey], [sortDirection])
    }
    const searchKey = _.get(columns, '[0].key')
    if (searchValue && searchKey) {
      items = items.filter(item => {
        return _.get(item, searchKey, '').indexOf(searchValue) !== -1
      })
    }
    return items.map((item, inx) => {
      const { id } = item
      const row = { id }
      const handleDeleteRow = this.handleTableAction.bind(this, remove, inx)
      const handleDeleteRowKey = e => {
        if (e.type === 'click' || e.key === 'Enter') {
          handleDeleteRow()
        }
      }
      columns.forEach(column => {
        row[column.key] =
          item[column.key] !== undefined ? item[column.key] : '-'
      })
      if (deletePrompt) {
        row.action = (
          <div
            className="creation-view-controls-table-delete-button"
            tabIndex="0"
            role={'button'}
            title={text}
            aria-label={text}
            onClick={handleDeleteRow}
            onKeyPress={handleDeleteRowKey}
          >
            <svg className="icon">
              <use href={'#diagramIcons_trash'} />
            </svg>
          </div>
        )
      }
      return row
    })
  }

  handleSort = selectedKey => () => {
    if (selectedKey) {
      this.setState(preState => {
        selectedKey = preState.selectedKey !== selectedKey ? selectedKey : null
        return {
          selectedKey,
          sortDirection: preState.sortDirection === 'asc' ? 'desc' : 'asc'
        }
      })
    }
  };

  setControlRef = (control, ref) => {
    control.ref = ref
  };

  render() {
    const { control, locale } = this.props
    const { exception } = control
    const { page = 1, pageSize } = this.state
    let rows = this.getRows()
    const totalFilteredItems = rows.length
    const inx = (page - 1) * pageSize
    rows = rows.slice(inx, inx + pageSize)
    return (
      <div
        className="creation-view-controls-table-container"
        ref={this.setControlRef.bind(this, control)}
      >
        <div className="creation-view-controls-table">
          {this.renderTree(rows)}
        </div>
        <PaginationV2
          key="pagination"
          id={'resource-table-pagination'}
          onChange={pagination => this.setState(pagination)}
          pageSize={pageSize}
          pageSizes={PAGE_SIZES.VALUES}
          totalItems={totalFilteredItems}
          page={page}
          disabled={pageSize >= totalFilteredItems}
          isLastPage={pageSize >= totalFilteredItems}
          itemsPerPageText={msgs.get('pagination.itemsPerPage', locale)}
          pageRangeText={(current, total) =>
            msgs.get('pagination.pageRange', [current, total], locale)
          }
          itemRangeText={(min, max, total) =>
            `${msgs.get('pagination.itemRange', [min, max], locale)} ${msgs.get(
              'pagination.itemRangeDescription',
              [total],
              locale
            )}`
          }
          pageInputDisabled={pageSize >= totalFilteredItems}
        />
        {exception && (
          <div className="creation-view-controls-table-exceptions">
            {exception}
          </div>
        )}
      </div>
    )
  }

  renderTree(rows) {
    const { control, locale } = this.props
    const { isLoading, isFailed, active, prompts = {}, available } = control
    const headers = this.getHeaders()
    if (isFailed) {
      return (
        <Notification
          title=""
          className="overview-notification"
          kind="error"
          subtitle={msgs.get('overview.error.default', locale)}
        />
      )
    } else if (isLoading) {
      return (
        <DataTableSkeleton
          columnCount={headers.length - 1}
          compact={false}
          rowCount={3}
          showheader={'true'}
          showtoolbar={'true'}
          zebra={false}
        />
      )
    } else {
      const { id, exceptions = [] } = control
      const {
        sortDirection,
        selectedKey,
        searchValue,
        originalSet
      } = this.state
      const sortColumn = selectedKey
      let { actions } = prompts
      actions = React.Children.map(actions, action => {
        return React.cloneElement(action, {
          appendTable: this.handleTableAction.bind(this, add),
          locale
        })
      })
      const activeSet = new Set(Object.keys(_.keyBy(active, 'id')))
      return (
        <DataTable
          key={id}
          rows={rows}
          headers={headers}
          render={({ rows: _rows, headers: _headers }) => {
            return (
              <TableContainer>
                <TableToolbar
                  aria-label={msgs.get('table.toolbar.description', locale)}
                >
                  <TableToolbarSearch
                    onChange={({ target }) =>
                      this.setState({
                        searchValue: target.value || '',
                        page: 1
                      })
                    }
                    id="resource-search-bar"
                    translateWithId={translateWithId.bind(null, locale)}
                    value={searchValue}
                    placeHolderText={msgs.get('search.label', locale)}
                  />
                  <TableToolbarContent>{actions}</TableToolbarContent>
                </TableToolbar>
                <Table className="resource-table" zebra={false}>
                  <TableHead>
                    <TableRow>
                      <TableSelectAll
                        id={'selectAll'}
                        ariaLabel={'tableSelectAllRow'}
                        name={'tableSelectAllRow'}
                        indeterminate={
                          active.length > 0 && active.length < available.length
                        }
                        disabled={false}
                        checked={
                          active.length > 0 &&
                          active.length === available.length
                        }
                        onSelect={this.handleSelect.bind(this, null)}
                      />
                      {_headers.map(header => (
                        <th scope={'col'} key={header.key}>
                          {header.key !== 'action' ? (
                            <button
                              title={msgs.get(
                                `svg.description.${
                                  !sortColumn || sortDirection === 'desc'
                                    ? 'asc'
                                    : 'desc'
                                }`,
                                locale
                              )}
                              onClick={this.handleSort(header.key)}
                              className={`bx--table-sort-v2${
                                sortDirection === 'asc'
                                  ? ' bx--table-sort-v2--ascending'
                                  : ''
                              }${
                                sortColumn === header.key
                                  ? ' bx--table-sort-v2--active'
                                  : ''
                              }`}
                              data-key={header.key}
                            >
                              <span className="bx--table-header-label">
                                {header.header}
                              </span>
                              <Icon
                                className="bx--table-sort-v2__icon"
                                name="caret--down"
                                description={msgs.get(
                                  `svg.description.${
                                    !sortColumn || sortDirection === 'desc'
                                      ? 'asc'
                                      : 'desc'
                                  }`,
                                  locale
                                )}
                              />
                            </button>
                          ) : null}
                        </th>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {_rows.map(row => (
                      <TableRow
                        key={row.id}
                        className={!originalSet.has(row.id) && 'new-row'}
                        data-row-name={_.get(row, 'cells[0].value')}
                      >
                        <TableSelectRow
                          id={row.id}
                          ariaLabel={'tableSelectRow'}
                          name={'tableSelectRow'}
                          checked={activeSet.has(row.id)}
                          onSelect={this.handleSelect.bind(this, row.id)}
                        />
                        {row.cells.map(cell => {
                          const key = _.get(cell, 'info.header')
                          const inx = exceptions.findIndex(
                            ({ cells }) =>
                              cells.indexOf(`${key}-${row.id}`) !== -1
                          )
                          const hasException = inx !== -1
                          const { id: rid } = row
                          return (
                            <TableCell
                              key={cell.id}
                              style={
                                hasException
                                  ? { color: 'red', cursor: 'pointer' }
                                  : {}
                              }
                              title={
                                hasException ? exceptions[inx].exception : ''
                              }
                            >
                              {this.renderCellValue(rid, cell, hasException)}
                            </TableCell>
                          )
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )
          }}
        />
      )
    }
  }

  renderCellValue(rid, cell, hasException) {
    const { value, info: { header } } = cell
    const column = this.headerMap[header]
    if (column) {
      const { type, available } = column
      const { control: { active } } = this.props
      const rinx = active.findIndex(({ id }) => id === rid)
      const cactive = _.get(active, `${rinx}.${header}`)
      switch (type) {
      case 'singleselect':
        return (
          <React.Fragment>
            <div className="creation-view-controls-table-singleselect">
              <DropdownV2
                label={value}
                items={available}
                onChange={this.handleCellEdit.bind(
                  this,
                  rinx,
                  header,
                  'singleselect'
                )}
                />
            </div>
          </React.Fragment>
        )
      case 'toggle':
        return (
          <React.Fragment>
            <div
              className="creation-view-controls-table-toggle"
              key={cell.id}
              >
              {cactive === undefined ? (
                '-'
              ) : (
                <React.Fragment>
                  <ToggleSmall
                    id={`id${rid}`}
                    ariaLabel={cactive}
                    defaultToggled={available.indexOf(cactive) === 0}
                    onToggle={this.handleCellEdit.bind(
                      this,
                      rinx,
                      header,
                      'toggle'
                    )}
                    />
                  <div className="table-toggle-label">
                    {_.capitalize(cactive)}
                  </div>
                </React.Fragment>
              )}
            </div>
          </React.Fragment>
        )
      }
    }

    return (
      <React.Fragment>
        {value}
        {hasException && <span>{' *'}</span>}
      </React.Fragment>
    )
  }

  handleSelect = id => {
    const { control } = this.props
    const { available, controlData } = control
    let { active } = control
    const availableMap = _.keyBy(available, 'id')
    if (id) {
      // add to active
      if (document.getElementById(id).checked) {
        this.addActives(active, [availableMap[id]], controlData)
      } else {
        // remove from active
        const inx = active.findIndex(data => id === data.id)
        active.splice(inx, 1)
      }
    } else {
      const wasActive = active.length > 0
      control.active = [];
      ({ active } = control)
      if (!wasActive) {
        this.addActives(active, available, controlData)
      }
    }
    this.props.handleChange(control)
  };

  addActives(active, actives, controlData) {
    actives.forEach(value => {
      Object.keys(value).forEach(
        key => value[key] === null && delete value[key]
      )
      active.push({ ...this.getDefaults(active, actives, controlData), ...value })
    })
  }

  getDefaults(active, actives, controlData) {
    const defaults = {}
    controlData.forEach(({ id: _id, active: _active }) => {
      if (_active) {
        defaults[_id] = typeof _active==='function' ? _active(active) : _active
      }
    })
    return defaults
  }

  handleCellEdit(rinx, header, type, e) {
    const { control } = this.props
    const { active, controlData } = control
    const availableMap = _.keyBy(controlData, 'id')
    const [checked, unchecked] = _.get(availableMap, `${header}.available`, [])
    let value
    switch (type) {
    case 'singleselect':
      value = e.selectedItem
      break
    case 'toggle':
      value = e ? checked : unchecked
      break
    }
    _.set(active, `${rinx}.${header}`, value)
    this.props.handleChange(control)
  }

  handleTableAction(action, data) {
    const { control } = this.props
    const { active, available } = control
    const existingMap = _.keyBy(available, ({ hostName, hostNamespace }) => {
      return `${hostName}-${hostNamespace}`
    })
    switch (action) {
    case remove:
      active.splice(data, 1)
      break
    case add:
      if (Array.isArray(data)) {
        data.reverse()
      } else {
        data = [data]
      }
      data = data.filter(({ hostName, hostNamespace }) => {
        return !existingMap[`${hostName}-${hostNamespace}`]
      })
      data.forEach(datum => {
        datum.isNew = true
        available.unshift(datum)
        active.unshift(datum)
      })
      break
    case edit:
    default:
      break
    }
    this.props.handleChange(control)
  }
}

export default ControlPanelTable
