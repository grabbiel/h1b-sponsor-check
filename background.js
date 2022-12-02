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
    setOutputData = async (outputData) =>{
        this.output = outputData;
        this.outputNumber = this.output.length;
    }
}

const posting = new PostingInformation();
const request = new ServerRequest();

chrome.tabs.onUpdated.addListener(
    function(tabId, changeInfo, tab){ //param: (optional) tab
        if(changeInfo.status === 'complete'){
            if([
                "https://www.linkedin.com/jobs/search/", "https://www.linkedin.com/jobs/collections/recommended/", "https://www.indeed.com/jobs"
            ].some(v => tab.url.includes(v))){
                chrome.tabs.sendMessage(tabId, {operation: 'parseWebsite'},
                function(response){
                    parseRequestResponse(response, tab.id);
                });
            }
        }
});

chrome.runtime.onMessage.addListener(
    function(message, sender, sendResponse){
        if(message.requestName === "true"){
            sendResponse({name: posting.companyName});
        }
        if(message.requestVisas === "true"){
            fillVisasInfo();
        }else if(message.requestRanking === "true"){
            fillRankingInfo();
        }else if(message.requestMoreInfo === "true"){
            fillProfilesInfo();
        }
    }
);

const parseRequestResponse = async (response, tabId) =>{
    if(response.operationStatus === "error"){return;}
    posting.setDescription(response.description);
    posting.setCompanyName(response.name);
    notifyUser(posting.postIsFriendly, tabId);
}

const fillProfilesInfo = async() =>{
    companyQuery("companyProfiles").then(()=>{
        summarizeProfiles().then((output) => {
            sendProfilesInfo(output);
        });
    });
}
const summarizeProfiles = async() =>{
    if(request.modified === false){return "N/A";}
    return request.output;
}
const sendProfilesInfo = async(output) =>{
    chrome.runtime.sendMessage({operation: "profilesRequest", data: output});
}


const fillRankingInfo = async() =>{
    companyQuery("companyRanking").then(()=>{
        summarizeRankingOutput().then((output) => {
            sendRankingInfo(output);
        });
    });
}
const summarizeRankingOutput = async () =>{
    if(request.modified === false){return "N/A";}
    var ranking = request.output[0].h1b_visa_ranking;
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
const sendRankingInfo = async (output) =>{
    chrome.runtime.sendMessage({operation: "rankingEstimation", data: output});
}


const fillVisasInfo = async () => {
    companyQuery("companySearch").then(() => {
        summarizeVisasOutput().then((output) => {
            sendVisasInfo(output);
        });
    });
}
const summarizeVisasOutput = async () => {
    if(request.modified === false){return "N/A";}
    if(request.outputNumber > 1){
        let i = 0; let sumRequests = 0;
        while(i < request.outputNumber){
            sumRequests+=parseInt(request.output[i].totalRequests);
            i+=1;
        }
        return Math.round(sumRequests/i);
    }
    return parseInt(request.output[0].totalRequests);
}
const sendVisasInfo = async (output) => {
    chrome.runtime.sendMessage({operation: "visaEstimation", data: output});
}


const companyQuery = async (requestType) => {
    request.setRequest(requestType);
    let companyName = parseCompanyName(posting.companyName);
    let resume = true; let i = 0;
    while(resume === true){
        await request.companyInformationQuery(
            companyName.slice(0, companyName.length - i).join(" ")
        ).then((newState) => {resume = newState;}); i+=1;
        if((companyName.length - i) == 0){
            resume = false;
        }
    }
}
function parseCompanyName(companyName){
    let splitName = companyName.includes(" ") ? companyName.split(" ") : [companyName];
    return splitName;
}


function notifyUser(postIsFriendly, tabId){
    if(!postIsFriendly){
        addBadge([255, 0, 0, 1], tabId);
    }else{
        addBadge([0, 255, 0, 1], tabId);
    }
}
function addBadge(rgbaCode, tabId){
    chrome.action.setBadgeBackgroundColor(
        {color: rgbaCode, tabId: tabId}
    );
    chrome.action.setBadgeText(
        {text: " ", tabId: tabId}
    );
}


