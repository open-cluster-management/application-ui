/*******************************************************************************
 * Licensed Materials - Property of IBM
 * (c) Copyright IBM Corporation 2018. All Rights Reserved.
 *
 * Note to U.S. Government Users Restricted Rights:
 * Use, duplication or disclosure restricted by GSA ADP Schedule
 * Contract with IBM Corp.
 *******************************************************************************/

const path = require('path')
const platformFilePath = path.join(__dirname, '../../../nls/platform.properties')
const headerFilePath = path.join(__dirname, '../../../nls/header.properties')
const propertiesParser = require('properties-parser')
const jsonfile = require('jsonfile')
const fs = require('fs')


module.exports = async function () {
  var content = fs.readFileSync(platformFilePath, { encoding: 'utf-8' })
  if (content) {
    var jsonObject = propertiesParser.parse(content)
    if (jsonObject) {
      const file = path.join(__dirname, '../../../tests/jest/config/platform-properties.json')
      jsonfile.writeFileSync(file, jsonObject, {spaces: 2, EOL: '\r\n'})
    }
  }
  var headerContent = fs.readFileSync(headerFilePath, { encoding: 'utf-8' })
  if (headerContent) {
    var headerJsonObject = propertiesParser.parse(content)
    if (headerJsonObject) {
      const file = path.join(__dirname, '../../../tests/jest/config/header-properties.json')
      jsonfile.writeFileSync(file, jsonObject, {spaces: 2, EOL: '\r\n'})
    }
  }
}