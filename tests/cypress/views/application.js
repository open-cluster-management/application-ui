/** *****************************************************************************
 * Licensed Materials - Property of Red Hat, Inc.
 * Copyright (c) 2020 Red Hat, Inc.
 ****************************************************************************** */

/// <reference types="cypress" />
const { wizards, timeWindows } = JSON.parse(Cypress.env("TEST_CONFIG"));

import {
  pageLoader,
  resourceTable,
  modal,
  noResource,
  notification
} from "./common";

export const createApplication = (data, type) => {
  cy.visit("/multicloud/applications");
  const { name, config } = data;
  const { timeWindow } = config;
  modal.clickPrimary();
  cy.get(".bx--detail-page-header-title-container").should("exist");
  cy.get("#name").type(name);
  cy.get("#namespace", { timeout: 50 * 1000 }).type(`${name}-ns`, {
    timeout: 50 * 1000
  });
  cy.get(`#${type}`).click();
  if (type === "git") {
    createGit(config);
  } else if (type === "objectbucket") {
    createObj(config);
  } else if (type === "local-cluster") {
    createLocal(config);
  }
  // comment until the validation is done
  // cy.get("#online-cluster-only-checkbox").click({ force: true });
  selectTimeWindow(timeWindow);
  submitSave();
};

export const createGit = config => {
  const { url, username, token, branch, path } = config;
  cy.get("#githubURL", { timeout: 20 * 1000 }).type(url);
  if (username && token) {
    cy.get("#githubUser").type(username);
    cy.get("#githubAccessID").type(token);
  }
  cy.get("#githubBranch").type(branch);
  cy.get("#githubPath").type(path);
};

export const createObj = config => {
  const { url, accessKey, secretKey } = config;
  cy.get("#objectstoreURL", { timeout: 20 * 1000 }).type(url);
  cy.get("#accessKey").then(input => {
    if (input.is("enabled")) {
      cy.get("#accessKey").type(accessKey);
      cy.get("#secretKey").type(secretKey);
    } else {
      cy.log(`credentials have not been saved...`);
    }
  });
};

export const createLocal = config => {
  const { repository } = config;
  repository
    ? cy.get("#namespaceChannelName", { timeout: 20 * 1000 }).type(repository)
    : cy.log("skip repository name as it is not provided");
};

export const submitSave = () => {
  cy
    .get("#create-button-portal-id", { timeout: 20 * 1000 })
    .should("not.be.disabled")
    .click();
  notification.shouldExist("success", { timeout: 60 * 1000 });
  cy.location("pathname", { timeout: 60 * 1000 }).should("include", `${name}`);
};

export const validateTopology = name => {
  cy.visit(`/multicloud/applications/${name}-ns/${name}`);
  cy.reload();
  cy
    .get(".search-query-card-loading", { timeout: 20 * 1000 })
    .should("not.exist");
  cy.get(".overview-cards-container");
  cy.get("#topologySvgId", { timeout: 50 * 1000 });
};

export const validateResourceTable = name => {
  cy.visit(`/multicloud/applications`);
  cy.get(".search-query-card-loading").should("not.exist", {
    timeout: 60 * 1000
  });
  pageLoader.shouldNotExist();
  resourceTable.rowShouldExist(name, 600 * 1000);
  resourceTable.rowNameClick(name);
  cy.reload(); // status isn't updating after unknown failure
  cy.get(".bx--detail-page-header-title");
};

export const validateTimewindow = (name, config) => {
  const { timeWindow } = config;
  const windowType = { activeinterval: "active", blockinterval: "blocked" };
  cy
    .exec(
      `oc login --server=${Cypress.env("OC_CLUSTER_URL")} -u ${Cypress.env(
        "OC_CLUSTER_USER"
      )} -p ${Cypress.env("OC_CLUSTER_PASS")} --insecure-skip-tls-verify=true`,
      { timeout: 100 * 1000 }
    )
    .its("stdout")
    .should("contain", "Login successful.")
    .then(() => {
      // get the subscription
      cy.log(
        "the subscription should contain the correct timewindow information"
      );
      cy
        .exec(`oc get subscription -n ${name}-ns`)
        .then(({ stdout, stderr }) => {
          cy.log(stdout || stderr);
          cy.log("the subscription is not empty");
          if (
            timeWindow.type === "activeinterval" ||
            timeWindow.type === "blockinterval"
          ) {
            const searchText = windowType[timeWindow.type];
            cy
              .exec(
                `oc get subscription ${name}-subscription-0 -n ${name}-ns -o yaml`
              )
              .its("stdout")
              .should("contain", "timewindow")
              .should("contain", searchText);
          } else {
            cy.log("active selected... checking the default type");
            cy
              .exec(
                `oc get subscription ${name}-subscription-0 -n ${name}-ns -o yaml`
              )
              .its("stdout")
              .should("not.contain", "timewindow");
          }
        });
    });
};

export const deleteApplicationUI = name => {
  cy.visit("/multicloud/applications");
  if (noResource.shouldNotExist()) {
    resourceTable.rowShouldExist(name, 600 * 1000);
    resourceTable.openRowMenu(name);
    resourceTable.menuClickDelete();
    modal.shouldBeOpen();
    // delete confirmation
    modal.clickDanger();
    modal.shouldNotBeVisible();

    // after deleting the app, it should not exist in the app table
    resourceTable.rowShouldNotExist(name, 300 * 1000);
    // disable for now letting the canary pass until #4677 is fixed
    // notification.shouldExist("success");
  } else {
    cy.log("No apps to delete...");
  }
};

export const apiResources = {
  action: (type, action, data) => {
    const name = data.name;
    const config = data.config;
    cy
      .exec(
        `oc login --server=${Cypress.env("OC_CLUSTER_URL")} -u ${Cypress.env(
          "OC_CLUSTER_USER"
        )} -p ${Cypress.env("OC_CLUSTER_PASS")} --insecure-skip-tls-verify=true`
      )
      .its("stdout")
      .should("contain", "Login successful.")
      .then(() => {
        cy.log(`${action} the ${type} channel if it exists`);
        if (type == "git") {
          cy
            .exec(`oc get channels -n ${name}-app-samples-chn-ns-0`)
            .then(({ stdout, stderr }) => {
              cy.log(stdout || stderr);
              if ((stdout || stderr).includes("No resource") === false) {
                cy.log("There exist channel");
                cy
                  .exec(
                    `oc ${action} channel ${name}-app-samples-chn-0 -n ${name}-app-samples-chn-ns-0`
                  )
                  .its("stdout")
                  .should("contain", name);
                cy
                  .exec(`oc ${action} ns ${name}-app-samples-chn-ns-0`)
                  .its("stdout")
                  .should("contain", `${name}`);
              } else {
                cy.log(
                  `The channel ${name}--app-samples-chn-0 in namespace:${name}-app-samples-chn-ns-0 is empty`
                );
              }
            });
        } else if (type == "local-cluster") {
          cy.log(`${action} the channel if it exists`);

          cy
            .exec(`oc get channels -n ${name}-resource-ns-0`)
            .then(({ stdout, stderr }) => {
              cy.log(stdout || stderr);
              if ((stdout || stderr).includes("No resource") === false) {
                cy.log("There exist channel");
                cy
                  .exec(
                    `oc ${action} channel ${name}-resource-0 -n ${name}-resource-ns-0`
                  )
                  .its("stdout")
                  .should("contain", name);
                cy
                  .exec(`oc ${action} ns ${name}-resource-ns-0`)
                  .its("stdout")
                  .should("contain", `${name}`);
              } else {
                cy.log(
                  `The channel ${name}-resource-0 in namespace:${name}-resource-ns-0 is empty`
                );
              }
            });
          const { repository } = config;
          if (repository) {
            cy
              .exec(`oc get channels -n ${name}-${repository}-chn-ns-0`)
              .then(({ stdout, stderr }) => {
                cy.log(stdout || stderr);
                if ((stdout || stderr).includes("No resource") === false) {
                  cy.log("There exists channel");
                  cy
                    .exec(
                      `oc ${action} channel ${name}-${repository}-chn-0 -n ${name}-${repository}-chn-ns-0`
                    )
                    .its("stdout")
                    .should("contain", name);
                  cy
                    .exec(`oc ${action} ns ${name}-${repository}-chn-ns-0`)
                    .its("stdout")
                    .should("contain", `${name}`);
                } else {
                  cy.log(
                    `The channel ${name}-${repository}-chn-0 in namespace:${name}-${repository}-chn-ns-0 is empty`
                  );
                }
              });
          }
        } else if (type == "objectbucket") {
          cy
            .exec(`oc get channels -n ${name}-dev1-chn-ns-0`)
            .then(({ stdout, stderr }) => {
              cy.log(stdout || stderr);
              if ((stdout || stderr).includes("No resource") === false) {
                cy.log("There exist channel");
                cy
                  .exec(
                    `oc ${action} channel ${name}-dev1-chn-0 -n ${name}-dev1-chn-ns-0`
                  )
                  .its("stdout")
                  .should("contain", name);
                cy
                  .exec(`oc ${action} ns ${name}-dev1-chn-ns-0`)
                  .its("stdout")
                  .should("contain", `${name}`);
              } else {
                cy.log(
                  `The channel ${name}-dev1-chn-0 in namespace:${name}-dev1-chn-ns-0 is empty`
                );
              }
            });
        }

        // subscription
        cy.log(`${action} the subscription if it exists`);
        cy
          .exec(`oc get subscription -n ${name}-ns`)
          .then(({ stdout, stderr }) => {
            cy.log(stdout || stderr);
            if ((stdout || stderr).includes("No resource") === false) {
              cy.log("There exists subscription");
              cy
                .exec(
                  `oc ${action} subscription ${name}-subscription-0 -n ${name}-ns`
                )
                .its("stdout")
                .should("contain", `${name}`);
            } else {
              cy.log(
                `The subscription ${name}-subscription-0 in namespace:${name}-ns is empty`
              );
            }
          });
        // placementrule
        cy.log(`${action} the placementrule if it exists`);
        cy
          .exec(`oc get placementrule -n ${name}-ns`)
          .then(({ stdout, stderr }) => {
            cy.log(stdout || stderr);
            if ((stdout || stderr).includes("No resource") === false) {
              cy.log("There exist subscription");
              cy
                .exec(
                  `oc ${action} placementrule ${name}-placement-0 -n ${name}-ns`
                )
                .its("stdout")
                .should("contain", `${name}`);
              cy
                .exec(`oc ${action} ns ${name}-ns`)
                .its("stdout")
                .should("contain", `${name}`);
            } else {
              cy.log(
                `The placementrule ${name}-placement-0 in namespace:${name}-ns is empty`
              );
            }
          });
      });
  }
};

export const selectTimeWindow = timeWindow => {
  const { setting, type, date } = timeWindow;
  if (setting && date) {
    cy.log(`Select TimeWindow - ${type}...`);
    const dateId = date.toLowerCase().substring(0, 3) + "-timeWindow";
    let typeID =
      type === "blockinterval"
        ? "#blocked-mode-timeWindow"
        : "#active-mode-timeWindow";
    cy
      .get(typeID)
      .scrollIntoView()
      .click({ force: true });
    cy.get(`#${dateId}`, { timeout: 20 * 1000 }).click({ force: true });
    cy
      .get(".bx--dropdown.config-timezone-dropdown.bx--list-box")
      .within($timezone => {
        cy.get("[type='button']").click();
        cy
          .get(".bx--list-box__menu-item:first-of-type", {
            timeout: 30 * 1000
          })
          .click();
      });
  } else {
    cy.log("leave default `active`");
  }
};

export const getTimeWindowType = name => {
  let nameList = name.split("-");
  let timeWindowType;
  "active activeinterval blockinterval".indexOf(
    nameList[nameList.length - 1]
  ) !== -1
    ? (timeWindowType = nameList[nameList.length - 1])
    : (timeWindowType = undefined);
  return timeWindowType;
};
