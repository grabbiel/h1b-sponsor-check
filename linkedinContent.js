var currentPageBody; // stores HTML body
var pageParser; // stores parsing class
var searchResultPosts; // stores listing class

window.addEventListener("load", function(initEvent){
    currentPageBody = initEvent.target.body;
});
chrome.runtime.onMessage.addListener(
    function(message, sender, sendResponse){
        if(window.innerWidth >= 640){
            if(message.ping === true){
                sendResponse({pong: true});
            }else if(message.origin === "background"){
                if(message.operation === "parsing"){
                    parse_document_body();
                    check_parsing_permission();
                }else if(message.operation === "edit"){
                    if(message.data.jobopening === true){
                        pageParser.classify_position(message.data.content);
                    }else if(message.data.cstatus === true){
                        pageParser.classify_company(message.data.content);
                    }else if(message.data.posts === true){
                        searchResultPosts.addListingBadge(
                            message.data.content.cstatus,
                            message.data.content.index
                        );
                    }
                }else if(message.operation === "create"){
                    if(message.data.popup === true){
                        if(message.data.content.h1bdata === null){
                            new PopUpMananger(message.data.content.cname, message.data.content.cdescription, message.data.content.h1bdata);
                        }else{
                            new PopUpMananger(message.data.content.cname, message.data.content.cdescription, message.data.content.h1bdata[0]);
                        }
                    }
                }
            }else if(message.origin === "popup"){

            }
    }
});

function parse_document_body(){
    if(currentPageBody === undefined || currentPageBody === null){
        currentPageBody = document.body;
    }
}

function check_parsing_permission(){
    if(currentPageBody.querySelector(".jobs-search-results__list-item")){
        determine_browsing_page();
    }else{
        check_for_job_view();
    }
}
function determine_browsing_page(){
    if(currentPageBody.querySelector("[title='Jobs based on your profile']")){
        searchResultPosts = new PostingsListing(currentPageBody, 1);
        pageParser = new RecommendedPage(currentPageBody);
        if(pageParser.cname === null || pageParser.cname === undefined || pageParser.cname === ""){
            new Messaging({origin: "content", operation: "submit", data:{
                name: true,
                content: searchResultPosts.getActiveCompanyName()}
            });
        }
    }else{
        pageParser = new SearchPage(currentPageBody);
        searchResultPosts = new PostingsListing(currentPageBody, 0);
    }
}
function check_for_job_view(){
    if(currentPageBody.querySelector(".jobs-unified-top-card__job-title")){
        console.log("you are in job view mode");
        pageParser = new ViewPage(currentPageBody, false, null);
    }
}
