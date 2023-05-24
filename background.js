import Content from "./modules/background/messaging/content.js";
import Popup from "./modules/background/messaging/popup.js";
import { posting, content_scripts } from "./utilities.js";

var current_tab_id = null;

/* === UPON LOADING (OR RELOADING), IF CAN ENSURE CONTENT.JS LISTENERS ARE SET === */
function injectContent(tabId) {
  chrome.tabs.sendMessage(tabId, { ping: true }, function (response) {
    if (response && response.pong) {
      /* if [linkedin] && [previously loaded (tab open)] */
      validateSiteInjection(tabId);
    } else if (chrome.runtime.lastError || response === undefined) {
      chrome.scripting.executeScript(
        {
          files: content_scripts,
          target: { tabId: tabId },
        },
        function () {
          /* if ![linkedin] because of !host_permission */
          if (chrome.runtime.lastError) {
            return;
          }

          /* if [linkedin] */
          validateSiteInjection(tabId);
        }
      );
    }
  });
}

/* === SET 3 MESSAGING SOURCES === */
//INITIAL GATE [1]
function initCreationListener(tab) {
  updateTabId(tab.id);
  injectContent(tab.id);
}
chrome.tabs.onCreated.addListener(initCreationListener);
// INITIAL GATE [2]
function initialActiveListener(activeInfo) {
  updateTabId(activeInfo.tabId);
  injectContent(activeInfo.tabId);
}
chrome.tabs.onActivated.addListener(initialActiveListener);
// INITIAL GATE [3]
function updateListenTest(tabId, changeInfo, tab) {
  if (changeInfo.status === "complete") {
    updateTabId(tabId);
    injectContent(tabId);
  }
}
chrome.tabs.onUpdated.addListener(updateListenTest);

/* ==== GENERAL FUNCTIONS ==== */
// Update the current tab ID
const updateTabId = (tabCurrentId) => {
  current_tab_id = tabCurrentId;
};

// Initialize parsing in the current tab
const initializeParsing = (tabCurrentId) => {
  chrome.tabs.sendMessage(tabCurrentId, {
    operation: "parsing",
    origin: "background",
  });
};

// Set the host page in the current tab
const setHostPage = (tabCurrentId) => {
  chrome.tabs.sendMessage(tabCurrentId, {
    operation: "hosting",
    origin: "background",
  });
};

// Validate site injection in the current tab
const validateSiteInjection = (tabCurrentId) => {
  chrome.tabs.sendMessage(
    tabCurrentId,
    { operation: "validation", origin: "background" },
    function (response) {
      if (response && response.set) initializeParsing(tabCurrentId);
      else if (response) setHostPage(tabCurrentId);
    }
  );
};

/* === RUNTIME LISTENERS === */
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (message.origin === "popup")
    new Popup(current_tab_id, posting, message, sendResponse);
  else if (message.origin === "content")
    new Content(current_tab_id, posting, message, sendResponse);
});
