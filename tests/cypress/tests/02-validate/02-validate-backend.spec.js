/** *****************************************************************************
 * Licensed Materials - Property of Red Hat, Inc.
 * Copyright (c) 2020 Red Hat, Inc.
 ****************************************************************************** */
const config = JSON.parse(Cypress.env("TEST_CONFIG"));
import { validateTimewindow, apiResources } from "../../views/application";

describe("Application", () => {
  for (const type in config) {
    const data = config[type].data;
    if (data.enable) {
      it(`channels, subscription and placementrule - should be validated - ${type}: ${
        data.name
      }`, () => {
        apiResources.action(type, "get", data);
      });
      it(`timewindow - should be validated - ${type}: ${data.name}`, () => {
        validateTimewindow(data.name, data.config);
      });
    } else {
      it(`disable validation on resource ${type}`, () => {
        cy.log(`skipping ${type} - ${data.name}`);
      });
    }
  }
});
