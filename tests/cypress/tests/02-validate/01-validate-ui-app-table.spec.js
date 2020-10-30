/*******************************************************************************
 * Copyright (c) 2020 Red Hat, Inc.
 *******************************************************************************/

const config = JSON.parse(Cypress.env("TEST_CONFIG"));
import { validateResourceTable } from "../../views/application";

describe("Application Validation Test for applications table", () => {
  for (const type in config) {
    const data = config[type].data;

    if (data.enable) {
      it(`Verify application info from applications table - ${type}: ${
        data.name
      }`, () => {
        validateResourceTable(data.name, data);
      });
    } else {
      it(`disable validation on resource ${type}`, () => {
        cy.log(`skipping ${type} - ${data.name}`);
      });
    }
  }
});