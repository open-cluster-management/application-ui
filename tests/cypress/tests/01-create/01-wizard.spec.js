/*******************************************************************************
 * Copyright (c) 2020 Red Hat, Inc.
 *******************************************************************************/

const config = JSON.parse(Cypress.env("TEST_CONFIG"));
import { createApplication } from "../../views/application";

describe("Application", () => {
  for (const type in config) {
    const data = config[type].data;

    if (data.enable) {
      it(`can be created on resource ${type} from the wizard`, () => {
        createApplication(data, type);
      });
    } else {
      it(`disable creation on resource ${type}`, () => {
        cy.log(`skipping wizard: ${type} - ${data.name}`);
      });
    }
  }
});
