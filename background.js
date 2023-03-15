
import ContentMessageManager from "./modules/background/messaging/content.js";
import PopupMessageManager from "./modules/background/messaging/popup.js";
import { posting, content_scripts } from "./utilities.js";

var current_tab_id = null;

/* === UPON EVENT, ENSURE CONTENT SCRIPT LISTENERS ARE SET === */
function injectContentScripts(tab_id) {
  chrome.tabs.sendMessage(tab_id, { ping: true }, function (response) {
    if (response && response.pong) {
    /* if [listeners are set] */
      validateSiteInjection(tab_id);
    } else if (chrome.runtime.lastError || response === undefined) {
    /* [listeners were not set] */
      chrome.scripting.executeScript(
        {
          files: content_scripts,
          target: { tabId: tab_id },
        },
        function () {
          /* !host_permissions: not right site */
          if (chrome.runtime.lastError) return;

          /* currently at any valid site listed in manifest.json */
          validateSiteInjection(tab_id);
        }
      );
    }
  });
}

/* === MAIN EVENT LISTENERS === */
//INITIAL GATE [1]: New tab is opened
function tabCreatedListener(tab) {
  updateTabId(tab.id);
  injectContentScripts(tab.id);
}
chrome.tabs.onCreated.addListener(tabCreatedListener);
// INITIAL GATE [2]: Switch tabs
function activeTabSwitchListener(activeInfo) {
  updateTabId(activeInfo.tabId);
  injectContentScripts(activeInfo.tabId);
}
chrome.tabs.onActivated.addListener(activeTabSwitchListener);
// INITIAL GATE [3]: Tab is refreshed
function updateListener(tabId, changeInfo, tab) {
  if (changeInfo.status === "complete") {
    updateTabId(tabId);
    injectContentScripts(tabId);
}}
chrome.tabs.onUpdated.addListener(updateListener);

/* ==== GENERAL FUNCTIONS ==== */
const updateTabId = (tab_id) => {
  current_tab_id = tab_id;
};
/**
 * Asks content script to initiate parsing of website
 * @param int currentTabId
 * @returns void
*/
const initializeParsing = (tab_id) => {
  chrome.tabs.sendMessage(tab_id, {
    operation: "parsing",
    origin: "background",
  });
};
/**
 * Asks content script to (re)set (or inject) site-specific content scripts
 * @param int currentTabId
 * @returns void
*/
const setHostPage = (tab_id) => {
  chrome.tabs.sendMessage(tab_id, {
    operation: "hosting",
    origin: "background",
  });
};
/**
 * Checks if ActiveTab has correct content scripts set
 * @param int currentTabId
 * @returns void
*/
const validateSiteInjection = (tab_id) => {
  chrome.tabs.sendMessage(
    tab_id,
    { operation: "validation", origin: "background" },
    function (response) {
      if (response && response.set) {
        initializeParsing(tab_id);
      } else if (response) {
        setHostPage(tab_id);
      }
    }
  );
};

/* === RUNTIME LISTENERS === */
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (message.origin === "popup")
    new PopupMessageManager(current_tab_id, posting, message, sendResponse);
  else if (message.origin === "content")
    new ContentMessageManager(current_tab_id, posting, message, sendResponse);
});
