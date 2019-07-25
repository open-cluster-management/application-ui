/*******************************************************************************
 * Licensed Materials - Property of IBM
 * (c) Copyright IBM Corporation 2019. All Rights Reserved.
 *
 * Note to U.S. Government Users Restricted Rights:
 * Use, duplication or disclosure restricted by GSA ADP Schedule
 * Contract with IBM Corp.
 *******************************************************************************/

// @flow
import { createAction } from '../../shared/utils/state'

const SET_SHOW_APP_DETAILS = 'SET_SHOW_APP_DETAILS'
const SET_CAROUSEL_ITERATOR = 'SET_CAROUSEL_ITERATOR'

export const initialStateOverview = {
  showAppDetails: false,
  carouselIterator: 0
}

export const AppOverview = (state = initialStateOverview, action) => {
  switch (action.type) {
  case SET_SHOW_APP_DETAILS: {
    return { ...state, showAppDetails: action.payload }
  }
  case SET_CAROUSEL_ITERATOR: {
    // We want to protect from going below 0
    if (action.payload < 0) {
      return { ...state, carouselIterator: 0 }
    }
    return { ...state, carouselIterator: action.payload }
  }
  default:
    return state
  }
}
export default AppOverview

export const setShowAppDetails = createAction(SET_SHOW_APP_DETAILS)
export const setCarouselIterator = createAction(SET_CAROUSEL_ITERATOR)