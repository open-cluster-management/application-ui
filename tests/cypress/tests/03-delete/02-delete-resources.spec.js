/*******************************************************************************
 * Copyright (c) 2020 Red Hat, Inc.
 *******************************************************************************/

const config = JSON.parse(Cypress.env("TEST_CONFIG"));
import { apiResources } from "../../views/application";

describe("Cleanup resouces", () => {
  for (const type in config) {
    const data = config[type].data;
    if (data.enable) {
      it(`delete application ${
        data.name
      }'s channel, subscription and placementrule`, () => {
        apiResources.action(type, "delete", data);
      });
    } else {
      it(`disable deletion on resource ${type}`, () => {
        cy.log(`skipping ${type} - ${data.name}`);
      });
    }
  }
});
