/** *****************************************************************************
 * Licensed Materials - Property of Red Hat, Inc.
 * Copyright (c) 2020 Red Hat, Inc.
 ****************************************************************************** */

/// <reference types="cypress" />

export const pageLoader = {
  shouldExist: () =>
    cy.get(".content-spinner", { timeout: 20000 }).should("exist"),
  shouldNotExist: () =>
    cy.get(".content-spinner", { timeout: 20000 }).should("not.exist")
};

export const resourceTable = {
  shouldExist: () =>
    cy.get(".resource-table", { timeout: 20000 }).should("exist"),
  shouldNotExist: () =>
    cy.get(".resource-table", { timeout: 20000 }).should("not.exist"),
  rowCount: () =>
    cy.get(".resource-table", { timeout: 500 * 1000 }).then($table => {
      return $table.find("tbody").find("tr").length;
    }),
  rowShouldExist: function(name, timeout) {
    this.searchTable(name);
    cy
      .get(`tr[data-row-name="${name}"]`, {
        timeout: timeout || 30 * 1000
      })
      .should("exist");
  },
  rowShouldNotExist: function(name, timeout, disableSearch) {
    !disableSearch && this.searchTable(name);
    cy
      .get(`tr[data-row-name="${name}"]`, {
        timeout: timeout || 30 * 1000
      })
      .should("not.exist");
  },
  rowNameClick: name => cy.get(`a[href*="${name}"]`).click(),
  searchTable: function(name) {
    cy.get("#page").then(page => {
      if (page.find("#resource-search-bar", { timeout: 15000 }).length > 0) {
        this.clearSearch();
        cy.get("#resource-search-bar").paste(name);
      }
    });
  },
  openRowMenu: name =>
    cy
      .get(`tr[data-row-name="${name}"] .bx--overflow-menu`, {
        timeout: 20 * 10000
      })
      .click(),
  menuClickEdit: () =>
    cy
      .get('button[data-table-action="table.actions.applications.edit"]', {
        timeout: 20 * 1000
      })
      .click(),
  menuClickDelete: () =>
    cy
      .get('button[data-table-action="table.actions.applications.remove"]', {
        timeout: 20 * 1000
      })
      .click(),
  menuClickDeleteConfirm: () =>
    cy
      .get("button")
      .contains("Delete application", { timeout: 20 * 1000 })
      .click()
};

export const secondaryHeader = {
  clickPrimary: () => cy.get(".secondary-header-actions-primary").click(),
  clickSecondary: () => cy.get(".secondary-header-actions-secondary").click()
};

export const noResource = {
  shouldExist: () =>
    cy.get(".no-resource", { timeout: 20000 }).should("be.visible"),
  shouldNotExist: timeout =>
    cy
      .get(".no-resource", { timeout: timeout ? timeout : 20 * 1000 })
      .should("not.be.visible")
};

export const modal = {
  shouldBeOpen: () => cy.get(".bx--modal", { timeout: 20000 }).should("exist"),
  shouldBeClosed: () =>
    cy.get(".bx--modal", { timeout: 20000 }).should("not.exist"),
  shouldBeVisible: () =>
    cy.get(".bx--modal-container", { timeout: 20000 }).should("be.visible"),
  shouldNotBeVisible: () =>
    cy.get(".bx--modal-container", { timeout: 20000 }).should("not.be.visible"),
  clickDanger: () =>
    cy.get(".bx--modal .bx--btn--danger--primary", { timeout: 20000 }).click(),
  clickPrimary: () =>
    cy
      .get(".bx--btn.bx--btn--sm.bx--btn--primary", { timeout: 20 * 1000 })
      .then($el => {
        Cypress.dom.isDetached($el); // false
      })
      .click({ force: true }),
  clickSecondary: () =>
    cy
      .get(".bx--btn.bx--btn--sm.bx--btn--secondary", { timeout: 20000 })
      .click(),
  confirmAction: text => cy.get("#confirm-action").type(text)
};

export const notification = {
  shouldExist: type =>
    cy
      .get(`.bx--inline-notification[kind="${type}"]`, { timeout: 200 * 1000 })
      .should("exist")
};

export const resourcePage = {
  shouldLoad: () => {
    cy.get("#page").then(page => {
      if (page.find(".resource-table").length) {
        resourceTable.shouldExist();
      } else {
        noResource.shouldExist();
      }
    });
  }
};
