var currentBody;

class HTMLCurrentDocument{
    constructor(documentHTML){
        this.currentVersion = documentHTML;
    }
}
class Indeed{
    constructor(documentBody){
        let mainPane = this.#parsePostingPane(documentBody);
        let description = this.#parseJobDescription(mainPane);
        this.jobDescription = description.innerText;
        let name = this.#parseCompanyName(mainPane);
        this.companyName = name.innerHTML.trim();
    }
    #parsePostingPane(documentBody){
        return documentBody.querySelector(":scope > main > #jobsearch-Main > [id^='jobsearch'] > div > [class^='jobsearch'] > [class*='MainContent'] > [class*='RightPane'] > [id^='jobsearch'] > div > div[class^='jobsearch'] > div > div > div > div > [class*='Display'] > div");
    }
    #parseJobDescription(mainPane){
        let description = mainPane.querySelector(":scope > [class*='Body'] > [class*='description'] > #jobDescriptionText");
        return description;
    }
    #parseCompanyName(mainPane){
        let nameAndRating = mainPane.querySelector(":scope > [class*='Header'] > div[class] > div:not([class]) > .jobsearch-CompanyInfoContainer > [class*='jobsearch'] > div > div > [class*='jobsearch']");
        let name = nameAndRating.querySelectorAll(":scope > div")[1].querySelector(":scope > div > a");
        return name;
    }
}

window.addEventListener("load", function(initEvent){
    currentBody = initEvent.target.body;
});
chrome.runtime.onMessage.addListener(
    function(message, sender, sendResponse){
        if(window.innerWidth >= 770){
            if(message.operation === "parseWebsite"){
                var document = new HTMLCurrentDocument(currentBody);
                var parser = new Indeed(document.currentVersion);
                sendResponse({description: parser.jobDescription, name: parser.companyName});
            }
        }else{
            sendResponse({operationStatus: "error"});
        }

    }
);