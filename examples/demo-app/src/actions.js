// SPDX-License-Identifier: MIT
// Copyright contributors to the kepler.gl project

import {push} from 'react-router-redux';
import {request, json as requestJson} from 'd3-request';
import {loadFiles, toggleModal} from '@kepler.gl/actions';
import {load} from '@loaders.gl/core';
import {CSVLoader} from '@loaders.gl/csv';
import {ArrowLoader} from '@loaders.gl/arrow';
import {_GeoJSONLoader as GeoJSONLoader} from '@loaders.gl/json';

import {
  LOADING_SAMPLE_ERROR_MESSAGE,
  LOADING_SAMPLE_LIST_ERROR_MESSAGE,
  MAP_CONFIG_URL
} from './constants/default-settings';
import {parseUri} from './utils/url';

// CONSTANTS
export const INIT = 'INIT';
export const LOAD_REMOTE_RESOURCE_SUCCESS = 'LOAD_REMOTE_RESOURCE_SUCCESS';
export const LOAD_REMOTE_RESOURCE_ERROR = 'LOAD_REMOTE_RESOURCE_ERROR';
export const LOAD_MAP_SAMPLE_FILE = 'LOAD_MAP_SAMPLE_FILE';
export const SET_SAMPLE_LOADING_STATUS = 'SET_SAMPLE_LOADING_STATUS';

// Sharing
export const PUSHING_FILE = 'PUSHING_FILE';
export const CLOUD_LOGIN_SUCCESS = 'CLOUD_LOGIN_SUCCESS';

// ACTIONS
export function initApp() {
  return {
    type: INIT
  };
}

export function loadRemoteResourceSuccess(response, config, options) {
  return {
    type: LOAD_REMOTE_RESOURCE_SUCCESS,
    response,
    config,
    options
  };
}

export function loadRemoteResourceError(error, url) {
  return {
    type: LOAD_REMOTE_RESOURCE_ERROR,
    error,
    url
  };
}

export function loadMapSampleFile(samples) {
  return {
    type: LOAD_MAP_SAMPLE_FILE,
    samples
  };
}

export function setLoadingMapStatus(isMapLoading) {
  return {
    type: SET_SAMPLE_LOADING_STATUS,
    isMapLoading
  };
}

/**
 * Actions passed to kepler.gl, called
 *
 * Note: exportFile is called on both saving and sharing
 *
 * @param {*} param0
 */
export function onExportFileSuccess({provider, options}) {
  return dispatch => {
    // if isPublic is true, use share Url
    if (options.isPublic && provider.getShareUrl) {
      dispatch(push(provider.getShareUrl(false)));
    } else if (!options.isPublic && provider.getMapUrl) {
      // if save private map to storage, use map url
      dispatch(push(provider.getMapUrl(false)));
    }
  };
}

export function onLoadCloudMapSuccess({provider, loadParams}) {
  return dispatch => {
    const mapUrl = provider?.getMapUrl(loadParams);
    if (mapUrl) {
      const url = `demo/map/${provider.name}?path=${mapUrl}`;
      dispatch(push(url));
    }
  };
}
/**
 * this method detects whther the response status is < 200 or > 300 in case the error
 * is not caught by the actualy request framework
 * @param response the response
 * @returns {{status: *, message: (*|{statusCode}|Object)}}
 */
function detectResponseError(response) {
  if (response.statusCode && (response.statusCode < 200 || response.statusCode >= 300)) {
    return {
      status: response.statusCode,
      message: response.body || response.message || response
    };
  }
}

// This can be moved into Kepler.gl to provide ability to load data from remote URLs
/**
 * The method is able to load both data and kepler.gl files.
 * It uses loadFile action to dispatcha and add new datasets/configs
 * to the kepler.gl instance
 * @param options
 * @param {string} options.dataUrl the URL to fetch data from. Current supoprted file type json,csv, kepler.json
 * @returns {Function}
 */
export function loadRemoteMap(options) {
  return dispatch => {
    dispatch(setLoadingMapStatus(true));
    // breakdown url into url+query params
    loadRemoteRawData(options.dataUrl).then(
      // In this part we turn the response into a FileBlob
      // so we can use it to call loadFiles
      ([file, url]) => {
        const {file: filename} = parseUri(url);
        dispatch(loadFiles([new File([file], filename)])).then(() =>
          dispatch(setLoadingMapStatus(false))
        );
      },
      error => {
        const {target = {}} = error;
        const {status, responseText} = target;
        dispatch(loadRemoteResourceError({status, message: responseText}, options.dataUrl));
      }
    );
  };
}

/**
 * Load a file from a remote URL
 * @param url
 * @returns {Promise<any>}
 */
function loadRemoteRawData(url) {
  if (!url) {
    // TODO: we should return reject with an appropriate error
    return Promise.resolve(null);
  }

  return new Promise((resolve, reject) => {
    request(url, (error, result) => {
      if (error) {
        reject(error);
        return;
      }
      const responseError = detectResponseError(result);
      if (responseError) {
        reject(responseError);
        return;
      }
      resolve([result.response, url]);
    });
  });
}

// The following methods are only used to load SAMPLES
/**
 *
 * @param {Object} options
 * @param {string} [options.dataUrl] the URL to fetch data from, e.g. https://raw.githubusercontent.com/keplergl/kepler.gl-data/master/earthquakes/data.csv
 * @param {string} [options.configUrl] the URL string to fetch kepler config from, e.g. https://raw.githubusercontent.com/keplergl/kepler.gl-data/master/earthquakes/config.json
 * @param {string} [options.id] the id used as dataset unique identifier, e.g. earthquakes
 * @param {string} [options.label] the label used to describe the new dataset, e.g. California Earthquakes
 * @param {string} [options.queryType] the type of query to execute to load data/config, e.g. sample
 * @param {string} [options.imageUrl] the URL to fetch the dataset image to use in sample gallery
 * @param {string} [options.description] the description used in sample galley to define the current example
 * @param {string} [options.size] the number of entries displayed in the current sample
 * @param {string} [keplergl] url to fetch the full data/config generated by kepler
 * @returns {Function}
 */
export function loadSample(options, pushRoute = true) {
  return (dispatch, getState) => {
    const {routing} = getState();
    if (options.id && pushRoute) {
      dispatch(push(`/demo/${options.id}${routing.locationBeforeTransitions?.search ?? ''}`));
    }
    // if the sample has a kepler.gl config file url we load it
    if (options.keplergl) {
      dispatch(loadRemoteMap({dataUrl: options.keplergl}));
    } else {
      dispatch(loadRemoteSampleMap(options));
    }

    dispatch(setLoadingMapStatus(true));
  };
}

/**
 * Load remote map with config and data
 * @param options {configUrl, dataUrl}
 * @returns {Function}
 */
function loadRemoteSampleMap(options) {
  return dispatch => {
    // Load configuration first
    const {configUrl, dataUrl} = options;

    Promise.all([loadRemoteConfig(configUrl), loadRemoteData(dataUrl)]).then(
      ([config, data]) => {
        // TODO: these two actions can be merged
        dispatch(loadRemoteResourceSuccess(data, config, options));
        dispatch(toggleModal(null));
      },
      error => {
        if (error) {
          const {target = {}} = error;
          const {status, responseText} = target;
          dispatch(
            loadRemoteResourceError(
              {
                status,
                message: `${responseText} - ${LOADING_SAMPLE_ERROR_MESSAGE} ${options.id} (${configUrl})`
              },
              configUrl
            )
          );
        }
      }
    );
  };
}

/**
 *
 * @param url
 * @returns {Promise<any>}
 */
function loadRemoteConfig(url) {
  if (!url) {
    // TODO: we should return reject with an appropriate error
    return Promise.resolve(null);
  }

  return new Promise((resolve, reject) => {
    requestJson(url, (error, config) => {
      if (error) {
        reject(error);
        return;
      }
      const responseError = detectResponseError(config);
      if (responseError) {
        reject(responseError);
        return;
      }
      resolve(config);
    });
  });
}

/**
 *
 * @param url to fetch data from (csv, json, geojson)
 * @returns {Promise<any>}
 */
function loadRemoteData(url) {
  if (!url) {
    // TODO: we should return reject with an appropriate error
    return Promise.resolve(null);
  }

  // Load data
  return new Promise(resolve => {
    const loaders = [CSVLoader, ArrowLoader, GeoJSONLoader];
    const loadOptions = {
      arrow: {
        shape: 'arrow-table'
      },
      csv: {
        shape: 'object-row-table'
      },
      metadata: true
    };
    const data = load(url, loaders, loadOptions);
    resolve(data);
  });
}

/**
 *
 * @param sampleMapId optional if we pass the sampleMapId, after fetching
 * map sample configurations we are going to load the actual map data if it exists
 * @returns {function(*)}
 */
export function loadSampleConfigurations(sampleMapId = null) {
  return dispatch => {
    requestJson(MAP_CONFIG_URL, (error, samples) => {
      if (error) {
        const {target = {}} = error;
        const {status, responseText} = target;
        dispatch(
          loadRemoteResourceError(
            {status, message: `${responseText} - ${LOADING_SAMPLE_LIST_ERROR_MESSAGE}`},
            MAP_CONFIG_URL
          )
        );
      } else {
        const responseError = detectResponseError(samples);
        if (responseError) {
          dispatch(loadRemoteResourceError(responseError, MAP_CONFIG_URL));
          return;
        }

        dispatch(loadMapSampleFile(samples));
        // Load the specified map
        const map = sampleMapId && samples.find(s => s.id === sampleMapId);
        if (map) {
          dispatch(loadSample(map, false));
        }
      }
    });
  };
}
