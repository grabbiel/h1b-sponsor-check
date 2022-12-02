var currentBody;

class HTMLCurrentDocument{
    constructor(documentHTML){
        this.currentVersion = documentHTML;
    }
}
class LinkedIn{
    constructor(documentBody){
        let mainPane = this.#parsePostingPane(documentBody);
        let description = this.#parseJobDescription(mainPane);
        this.jobDescription = description.innerText;
        let name = this.#parseCompanyName(mainPane);
        this.companyName = name.innerText.trim();
    }
    #parsePostingPane(documentBody){
        let applicationOutlet = documentBody.querySelector(":scope > .application-outlet").querySelector(":scope > .authentication-outlet");
        let childrenInOutlet = applicationOutlet.querySelectorAll(":scope > div").length;
        let mainPane = applicationOutlet.querySelectorAll(":scope > div")[childrenInOutlet-1].querySelector(":scope > div > div > #main > div > .jobs-search__job-details > .jobs-search__job-details--container > .jobs-details > div:not([class]) > div");
        return mainPane;
    }
    #parseJobDescription(mainPane){
        let jobDescription = mainPane.querySelector(":scope > .jobs-description");
        let jobDescriptionContent = jobDescription.querySelector(":scope > article").querySelector(":scope > div");
        return jobDescriptionContent.querySelector(":scope > #job-details").querySelector(":scope > span");
    }
    #parseCompanyName(mainPane){
        let topPane = mainPane.querySelectorAll(":scope > div:not([id]) > .jobs-unified-top-card > div")[0];
        let companyName = topPane.querySelector(":scope > [class^='jobs-unified-top-card__content'] > .jobs-unified-top-card__primary-description > .jobs-unified-top-card__subtitle-primary-grouping > .jobs-unified-top-card__company-name");
        return companyName;
    }
}

window.addEventListener("load", function(initEvent){
    currentBody = initEvent.target.body;
});

chrome.runtime.onMessage.addListener(
    function(message, sender, sendResponse){
        if(window.innerWidth >= 640){
            if(message.operation === "parseWebsite"){
                var document = new HTMLCurrentDocument(currentBody);
                var parser = new LinkedIn(document.currentVersion);
                sendResponse({description: parser.jobDescription, name: parser.companyName});
            }
        }else{
            sendResponse({operationStatus: "error"});
        }
    }
);
