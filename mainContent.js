var ParsingWorker = null; // stores main pane parsing class constructor
var parsingWorker = null; // stores parsing worker instance
var parsing = false; // state of parsing operation
var sitename = 0; // code for job board site


chrome.runtime.onMessage.addListener(
    function(message, sender, sendResponse){
        
        if(window.innerWidth < 640) return;

        if(message.ping === true) sendResponse({ pong: true });

        else if(message.origin === "background"){
                
            switch(message.operation){

                case "validation":
                    if(sitename === 0) sendResponse({ set: false });
                    else sendResponse({ 
                        set: validateParsingWorker(Boolean(parsingWorker), sitename) 
                    });
                    break;

                case "hosting":
                    setSitename();
                    break;

                case "parsing":
                    runParsing();
                    break;

                case "set-parsing-worker":
                    if(setParsingWorker(message.data.set)) runParsing();
                    break;

                case "edit":
                    editDOMContent(message.data);
                    break;
                
                case "create":
                    createDOMContent(message.data);
                    break;

                default:
                    break;
    }}
});



/* ====== SCRIPTING REQUESTS ====== */
/**
 * Request background script site-specific content scripts into active tab
 * @param int website_code
 * @returns void
*/
async function requestSiteInjection(sitename){
    chrome.runtime.sendMessage({
        operation: "injection",
        origin: "content",
        data: {sitename: sitename}
    });
}

/* ====== GENERAL PARSING METHODS ====== */
/**
 * parsingWorker will start parsing, if no other concurrent sessions are running
 * @param void
 * @return void
*/
async function runParsing(){
    if(parsing) return;
    else parsingWorker.set_method();
}
/**
 * Set ParsingWorker class and instantiates it. Return true if successful setting.
 * @param Boolean injection_status
 * @returns Boolean
*/
async function setParsingWorker(injection_status){
    if(!injection_status) return false;

    switch(sitename){
        case 1:
            ParsingWorker = LinkedinWorker;
            break;
        case 2:
            ParsingWorker = IndeedWorker;
            break;
        default:
            break;
    }
    parsingWorker = new ParsingWorker();
    return true;
}
/**
 * Set website code based on which website the user is on.
 * @param void
 * @returns void
*/
function setSitename(){

    if(validateLinkedinWorker()){

        sitename = 1;
        requestSiteInjection(sitename);

    }else if(validateIndeedWorker()){
        
        sitename = 2;
        try{
            ParsingWorker = IndeedWorker;
            parsingWorker = new ParsingWorker();
            runParsing();
        }catch{}

    }

}

/* ====== DOM EDIT FUNCTIONS ====== */
/**
 * Add company or job title badges based on message from content script. Calling this function resets the parsing state to false (other sessions can be activated)
 * @param Object message_data
 * @returns void
*/
function editDOMContent(message_data){
    parsing = false;

    if(message_data.jobopening){

        parsingWorker.classify_posting_position(message_data.content);

    }else if(message_data.cstatus){
        
        parsingWorker.classify_posting_company(message_data.content);

    }else if(message_data.posts){
        parsingWorker.add_listing_badge(message_data.content.cstatus, message_data.content.index);
    }
}
/**
 * Create DOM elements (e.g., popup window)
 * @param Object message_data
 * @returns void
*/
function createDOMContent(message_data){
    if(!message_dataContent.popup) return;
    new PopUpManager(message_data.content.cname, message_data.content.cdescription, message_data.content.h1bdata);
}
