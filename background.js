import Content from "./modules/background/messaging/content.js";
import PostingInformation from "./modules/background/posting.js";
import Popup from "./modules/background/messaging/popup.js";


var current_tab_id;
const content_scripts = ["./modules/contents/linkedin/pages/methods.js",
"./modules/contents/linkedin/pages/page.js",
"./modules/contents/messaging.js",
"./modules/contents/linkedin/pages/jobview.js",
"./modules/contents/linkedin/pages/jobsearch.js",
"./modules/contents/linkedin/pages/recommended.js",
"./modules/contents/linkedin/listing.js",
"./modules/contents/badges/position.js",
"./modules/contents/badges/company.js",
"./modules/contents/linkedin/popup/loading.js",
"./modules/contents/linkedin/popup/main.js",
"linkedinContent.js"];
const posting = new PostingInformation();


/* === UPON LOADING (OR RELOADING), IF CAN ENSURE CONTENT.JS LISTENERS ARE SET === */
function injectContent(tabId, eventtype){
    chrome.tabs.sendMessage(tabId, {ping: true}, function(response){
        if(response && response.pong){
            /* if [linkedin] && [previously loaded (tab open)] */
            initialParsingMessage(tabId, eventtype);
        }else if(chrome.runtime.lastError || response===undefined){
            chrome.scripting.executeScript({
                files: content_scripts,
                target: {tabId: tabId}
            }, function(){
                if(chrome.runtime.lastError){
                    /* if ![linkedin] because of !host_permission */
                    return;
                }else{
                    /* if [linkedin] */
                    initialParsingMessage(tabId, eventtype);
                }
            });
            
        }
    });
}

/* === SET 3 MESSAGING SOURCES === */
//INITIAL GATE [1]
function initCreationListener(tab){
    updateTabId(tab.id);
    injectContent(tab.id);
}
chrome.tabs.onCreated.addListener(initCreationListener);
// INITIAL GATE [2]
function initialActiveListener(activeInfo){
    updateTabId(activeInfo.tabId);
    injectContent(activeInfo.tabId);
}
chrome.tabs.onActivated.addListener(initialActiveListener);
// INITIAL GATE [3]
function updateListenTest(tabId, changeInfo, tab){
    if(changeInfo.status === "complete"){
        updateTabId(tabId);
        injectContent(tabId);
    }
}
chrome.tabs.onUpdated.addListener(updateListenTest);

/* ==== GENERAL FUNCTIONS ==== */
const initialParsingMessage = (tabCurrentId) =>{
    chrome.tabs.sendMessage(tabCurrentId, 
        {operation: "parsing",
        origin: "background"}
    );
}
const updateTabId = (tabID) => {
    current_tab_id = tabID;
}

/* === RUNTIME LISTENERS === */
chrome.runtime.onMessage.addListener(
    function(message, sender, sendResponse){
        if(message.origin === "popup"){
            new Popup(current_tab_id, posting, message, sendResponse);
        }else if(message.origin === "content"){
            new Content(current_tab_id, posting, message, sendResponse);
        }
    }
);