/** *****************************************************************************
 * Licensed Materials - Property of Red Hat, Inc.
 * Copyright (c) 2020 Red Hat, Inc.
 ****************************************************************************** */

/// <reference types="cypress" />
export const apiResources = {
  action: (type, action, data) => {
    const name = data.name;
    const config = data.config;

    channels(type, action, name, config);
    subscription(action, name);
    placementrule(action, name);
  }
};

export const channels = (type, action, name, config) => {
  const { repository } = config;
  const channelDict = {
    git: {
      channelNs: "app-samples-chn-ns",
      channelName: "app-samples-chn"
    },
    objectbucket: {
      channelNs: "dev1-chn-ns",
      channelName: "dev1-chn"
    },
    "local-cluster": {
      channelNs: "resource-ns",
      channelName: "resource"
    }
  };

  if (type === "local-cluster") {
    if (repository) {
      let newValue = {
        channelNs: `${repository}-chn-ns`,
        channelName: `${repository}-chn`
      };
      channelDict[type] = newValue;
    }
  }

  const { channelNs, channelName } = channelDict[type];
  cy.log(`${action} the ${type} channel if it exists`);
  cy
    .exec(`oc get channels -n ${name}-${channelNs}-0`)
    .then(({ stdout, stderr }) => {
      cy.log(stdout || stderr);
      if ((stdout || stderr).includes("No resource") === false) {
        cy.log("There exist channel");
        cy
          .exec(
            `oc ${action} channel ${name}-${channelName}-0 -n ${name}-${channelNs}-0`
          )
          .its("stdout")
          .should("contain", name);
        cy
          .exec(`oc ${action} ns ${name}-${channelNs}-0`)
          .its("stdout")
          .should("contain", `${name}`);
      } else {
        cy.log(
          `The channel ${name}-${channelName}-0 in namespace:${name}-${channelNs}-ns-0 is empty`
        );
      }
    });
};

export const placementrule = (action, name) => {
  cy.log(`${action} the placementrule if it exists`);
  cy.exec(`oc get placementrule -n ${name}-ns`).then(({ stdout, stderr }) => {
    cy.log(stdout || stderr);
    if ((stdout || stderr).includes("No resource") === false) {
      cy.log("There exist subscription");
      cy
        .exec(`oc ${action} placementrule ${name}-placement-0 -n ${name}-ns`)
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
};

export const subscription = (action, name) => {
  cy.log(`${action} the subscription if it exists`);
  cy.exec(`oc get subscription -n ${name}-ns`).then(({ stdout, stderr }) => {
    cy.log(stdout || stderr);
    if ((stdout || stderr).includes("No resource") === false) {
      cy.log("There exists subscription");
      cy
        .exec(`oc ${action} subscription ${name}-subscription-0 -n ${name}-ns`)
        .its("stdout")
        .should("contain", `${name}`);
    } else {
      cy.log(
        `The subscription ${name}-subscription-0 in namespace:${name}-ns is empty`
      );
    }
  });
};

export const validateTimewindow = (name, config) => {
  const { timeWindow } = config;
  const windowType = { activeinterval: "active", blockinterval: "blocked" };
  // get the subscription
  cy.log("the subscription should contain the correct timewindow information");
  cy.exec(`oc get subscription -n ${name}-ns`).then(({ stdout, stderr }) => {
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
};
