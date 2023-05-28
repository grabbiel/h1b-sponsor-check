/* 

*/

// Stores Parsing Constructor
var ParsingWorker = null;
// Stores Instance of Parsing Constructor
var parsingWorker = null;
// Parsing State (Boolean)
var parsing = false;
// Site Code [1 - 3] ~ [LinkedIn, Indeed, Glassdoor]
var sitename = 0;

/* ========= MAIN LISTENER THREAD (SOURCES: BACKGROUND) ========= */
chrome.runtime.onMessage.addListener(
    function(message, sender, sendResponse){
        
        // Screen is too small for proper display: EXIT
        if(window.innerWidth < 640) return;

        // Background tests content script status
        if(message.ping === true) sendResponse({ pong: true });

        // Background Script Operations
        else if(message.origin === "background"){
                
            switch(message.operation){
                // Content Script Injection [Validate]
                case "validation":
                    // no parsing worker set
                    if(sitename === 0) sendResponse({ set: false });
                    else sendResponse({ 
                        set: validate_parsing_worker(Boolean(parsingWorker), sitename) 
                    });
                    break;

                // Determine Current Job Site [LinkedIn, Indeed, Glassdoor]
                case "hosting":
                    set_sitename();
                    break;

                // 
                case "parsing":
                    run_parsing();
                    //parsing = true;
                    break;

                case "set-parsing-worker":
                    if(set_parsing_worker(message.data.set)) run_parsing();
                    break;

                case "edit":
                    edit_dom_content(message.data);
                    break;
                
                case "create":
                    create_dom_content(message.data);
                    break;

                default:
                    break;
    }}
});



/* ====== SCRIPTING REQUESTS ====== */
async function request_site_injection(sitename){
    chrome.runtime.sendMessage({
        operation: "injection",
        origin: "content",
        data: {sitename: sitename}
    });
}

/* ====== GENERAL PARSING METHODS ====== */
async function run_parsing(){
    if(parsing) return;
    else set_sitename();
}
async function set_parsing_worker(injectionStatus){
    if(!injectionStatus) return false
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
function set_sitename(){

    if(validate_linkedin_worker()){

        sitename = 1;
        request_site_injection(sitename);

    }else if(validate_indeed_worker()){
        
        sitename = 2;
        try{
            ParsingWorker = IndeedWorker;
            parsingWorker = new ParsingWorker();
            run_parsing();
        }catch{}

    }else if(validate_glassdoor_worker()){
        sitename = 3;
        try{
            ParsingWorker = GlassdoorWorker;
            parsingWorker = new ParsingWorker();
            run_parsing();
        }catch{}
    }
    
    chrome.runtime.sendMessage({
        operation: "submit",
        origin: "content",
        data: {
            parsingworkerClass: true,
            content: {
                platform_code: sitename
            }
        }
    });

}

/* ====== DOM EDIT FUNCTIONS ====== */
function edit_dom_content(messageContent){
    parsing = false;

    if(messageContent.jobopening){

        parsingWorker.classify_posting_position(messageContent.content);

    }else if(messageContent.cstatus){
        
        parsingWorker.classify_posting_company(messageContent.content);

    }else if(messageContent.posts){
        parsingWorker.add_listing_badge(messageContent.content.cstatus, messageContent.content.index);
    }
}
function create_dom_content(messageContent){
    if(!messageContent.popup) return;
    new PopUpManager(messageContent.content.cname, messageContent.content.cdescription, messageContent.content.h1bdata);
}

