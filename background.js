class PostingInformation{
    constructor(){
        this.jobDescription = null;
        this.companyName = null;
        this.postIsFriendly = true;
    }
    setDescription(jobDescription){
        this.jobDescription = jobDescription;
        this.#classifyDescription();
    }
    setCompanyName(companyName){
        this.companyName = companyName;
    }
    #classifyDescription(){
        if(this.jobDescription.includes('H-1B') || this.jobDescription.includes('U.S.-person') || this.jobDescription.includes("sponsorship") || this.jobDescription.includes("U.S. citizen") || this.jobDescription.includes(" OPT ") || this.jobDescription.includes("eligible to work") || this.jobDescription.includes("work authorization") || this.jobDescription.includes("Unrestricted U.S.")){
            this.postIsFriendly = false; return;
        }
        this.postIsFriendly = true;
    }
    parseCompanyName(){
        let splitName = this.companyName.includes(" ") ? this.companyName.split(" ") : [this.companyName];
        return splitName;
    }
}
class JobsListing{
    constructor(visiblePosts, tabId){
        this.request = new ServerRequest();
        this.posts = visiblePosts;
        this.activeTabId = tabId;
        this.#iterateRequests();
    }
    #iterateRequests = async()=>{
        this.posts.forEach((resultPost)=>{
            this.#queryCompanyName(resultPost);
        });
    }
    #queryCompanyName = async(resultPost)=>{
        const postingInstance = new PostingInformation();
        postingInstance.setCompanyName(resultPost.name);
        this.request.companyNameIterateQuery(postingInstance, "companySearch").then(() => {
            chrome.tabs.sendMessage(this.activeTabId, {
                operation: "classifyJobList", data: {searchStatus: this.request.modified, index: resultPost.index}
            });
        });
    }
}
class ServerRequest{
    constructor(){
        this.initialRoute = "http://ec2-3-23-131-242.us-east-2.compute.amazonaws.com/phpdocs/";
        this.fullRoute = null;
        this.formData = new FormData();
        this.output = null;
        this.outputNumber = null;
        this.modified = null;
    }
    setRequest(requestType){
        this.fullRoute = this.initialRoute+requestType+".php";
    }
    runQuery = async () => {
        let fetchResult = await fetch(this.fullRoute, {method: "POST", body: this.formData});
        let jsonResponse = await fetchResult.json();
        return jsonResponse;
    }
    companyInformationQuery = async (companyName) =>{
        this.formData.append("companysearch", companyName);
        let dataQuery = await this.runQuery();
        if(dataQuery.length > 0){
            await this.setOutputData(dataQuery);
            this.modified = true;
            return false;
        }else{
            this.modified = false;
            return true;
        }
    }
    companyNameIterateQuery = async (posting, requestType) => {
        this.setRequest(requestType);
        let companyName = posting.parseCompanyName();
        let resume = true; let i = 0;
        while(resume === true){
            await this.companyInformationQuery(
                companyName.slice(0, companyName.length - i).join(" ")
            ).then((newState) => {resume = newState;}); i+=1;
            if((companyName.length - i) == 0){
                resume = false;
            }
        }
    }
    setOutputData = async (outputData) =>{
        this.output = outputData;
        this.outputNumber = this.output.length;
    }
}
class ProfilesMessaging{
    constructor(posting){
        this.request = new ServerRequest();
        this.#fill(posting);
    }
    #fill = async(posting) =>{
        this.request.companyNameIterateQuery(posting, "companyProfiles").then(()=>{
            this.#summarize().then((output) => {
                this.#sendMessage(output);
            });
        });
    }
    #summarize = async() =>{
        if(this.request.modified === false){return "N/A";}
        return this.request.output;
    }
    #sendMessage = async(output) =>{
        chrome.runtime.sendMessage({operation: "profilesRequest", data: output});
    }
}
class RankingMessaging{
    constructor(posting){
        this.request = new ServerRequest();
        this.#fill(posting);
    }

    #fill = async(posting) =>{
        this.request.companyNameIterateQuery(posting, "companyRanking").then(()=>{
            this.#summarize().then((output) => {
                this.#sendMessage(output);
            });
        });
    }
    #summarize = async () =>{
        if(this.request.modified === false){return "N/A";}
        var ranking = this.request.output[0].h1b_visa_ranking;
        var position = "TOP ";
        if(ranking < 11){
            position+=10;
        }else if(ranking < 26){
            position+=25;
        }else if(ranking < 51){
            position+=50;
        }else if(ranking < 101){
            position+=100;
        }else if(ranking < 251){
            position+=250;
        }else if(ranking < 501){
            position+=500;
        }else if(ranking < 1001){
            position+=1000;
        }else if(ranking < 10001){
            position+="10k";
        }else{
            position = "N/A";
        }
        return position;
    }
    #sendMessage = async (output) =>{
        chrome.runtime.sendMessage({operation: "rankingEstimation", data: output});
    }
    
}
class VisasMessaging{
    constructor(posting){
        this.request = new ServerRequest();
        this.#fill(posting);
    }
    #fill = async (posting) => {
        this.request.companyNameIterateQuery(posting, "companySearch").then(() => {
            this.#summarize().then((output) => {
                this.#sendMessage(output);
            });
        });
    }
    #summarize = async () => {
        if(this.request.modified === false){return "N/A";}
        if(this.request.outputNumber > 1){
            let i = 0; let sumRequests = 0;
            while(i < this.request.outputNumber){
                sumRequests+=parseInt(this.request.output[i].totalRequests);
                i+=1;
            }
            return Math.round(sumRequests/i);
        }
        return parseInt(this.request.output[0].totalRequests);
    }
    #sendMessage = async (output) => {
        chrome.runtime.sendMessage({operation: "visaEstimation", data: output});
    }
}
class ExtensionBubbleNotification{
    constructor(postFriendliness, tabId){
        this.badgeColor = this.setBadgeColor(postFriendliness);
        this.activeTabId = tabId;
        this.addBadge();
    }
    setBadgeColor(postFriendliness){
        if(!postFriendliness){
            return [255, 0, 0, 1];
        }else{
            return [0, 255, 0, 1];
        }
    }
    addBadge(){
        chrome.action.setBadgeBackgroundColor(
            {color: this.badgeColor, tabId: this.activeTabId}
        );
        chrome.action.setBadgeText(
            {text: " ", tabId: this.activeTabId}
        );
    }
}

const acceptedURLs = ["https://www.linkedin.com/jobs/search/", "https://www.linkedin.com/jobs/collections/recommended/", "https://www.indeed.com/jobs"];
const posting = new PostingInformation();
const request = new ServerRequest();

chrome.tabs.onUpdated.addListener(
    function(tabId, changeInfo, tab){
        if(changeInfo.status === 'complete'){
            if(acceptedURLs.some(url => tab.url.includes(url))){
                chrome.tabs.sendMessage(tabId, {operation: 'parseWebsite'},
                function(response){
                    parseRequestResponse(response, tab.id);
                });
            }
        }
});

chrome.runtime.onMessage.addListener(
    function(message, sender, sendResponse){
        if(message.requestName === true){
            sendResponse({name: posting.companyName});
        }
        if(message.requestVisas === true){
            new VisasMessaging(posting);
        }else if(message.requestRanking === true){
            new RankingMessaging(posting);
        }else if(message.requestMoreInfo === true){
            new ProfilesMessaging(posting);
        }else if(message.requestCompanyNameClass === true){
            sendCompanyStatus(message.data);
        }
    }
);

const parseRequestResponse = async (response, tabId) =>{
    if(response.operationStatus === "error"){return;}
    posting.setDescription(response.description);
    posting.setCompanyName(response.name);
    chrome.tabs.sendMessage(tabId, {operation: "classifyJobPosting", data: posting.postIsFriendly});
    new ExtensionBubbleNotification(posting.postIsFriendly, tabId);
    new JobsListing(response.posts, tabId);
}
