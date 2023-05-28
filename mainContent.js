var ParsingWorker = null; // stores main pane parsing class constructor
var parsingWorker = null; // stores pa
var parsing = false;
var sitename = 0;


chrome.runtime.onMessage.addListener(
    function(message, sender, sendResponse){
        
        if(window.innerWidth < 640) return;

        if(message.ping === true) sendResponse({ pong: true });

        else if(message.origin === "background"){
                
            switch(message.operation){
                case "validation":
                    if(sitename === 0) sendResponse({ set: false });
                    else sendResponse({ 
                        set: validate_parsing_worker(Boolean(parsingWorker), sitename) 
                    });
                    break;

                case "hosting":
                    set_sitename();
                    break;

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
    else parsingWorker.set_method();
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

