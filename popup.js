class documentSchema{
    constructor(){
        this.year = document.getElementById("lastYear");
        this.#setCurrentYear();
        this.mainTable = document.getElementById("summarized-table");
        this.profilesContainer = document.getElementById("profiles-container");
        this.profilesTable = document.getElementById("profiles-table");
        this.companyPlaceholder = document.getElementById('company-name');
        this.visasPlaceholder = document.getElementById('visas-requested');
        this.rankingPlaceholder = document.getElementById('employer-ranking');
        this.expandButton = document.getElementById('extra_info_btn');
    }
    #setCurrentYear(){
        this.year.innerHTML = (new Date().getFullYear()) - 1;
    }
    displayProfiles(){
        this.profilesContainer.setAttribute("hidden", "true");
        this.mainTable.removeAttribute("hidden");
        this.expandButton.innerHTML = "More info";
        this.#setDefaultProfilesTable();
    }
    displayDefault(){
        this.mainTable.setAttribute("hidden", "true");
        this.profilesContainer.removeAttribute("hidden");
        this.expandButton.innerHTML = "Return";
    }
    #setDefaultProfilesTable(){
        this.profilesTable.innerHTML = "";
        let defaultRow = document.createElement("tr");
        let companyColumn = document.createElement("th").innerHTML = "Company";
        defaultRow.appendChild(companyColumn);
        let urlColumn = document.createElement("th").innerHTML = "URL";
        defaultRow.appendChild(urlColumn);
        this.profilesTable.appendChild(defaultRow);
    }
    injectProfiles(queryOutput){
        if(queryOutput==="N/A"){
            this.profilesTable.appendChild(document.createElement("div").innerHTML(queryOutput));
            return;}
        let i=0;
        while(i < queryOutput.length){
            let newRow = document.createElement("tr");

            let companyCell = document.createElement("td");
            companyCell.innerHTML = queryOutput[i].name_myvisajobs;
            newRow.appendChild(companyCell);

            let urlCell = document.createElement("td");
            let anchorContainer = document.createElement("a");
            anchorContainer.setAttribute("href", queryOutput[i].profile_site);
            anchorContainer.classList.add("profile-sites");
            let btnURL = document.createElement("input");
            btnURL.setAttribute("type", "button");
            btnURL.setAttribute("value", "URL");
            anchorContainer.appendChild(btnURL);

            urlCell.appendChild(anchorContainer);
            newRow.appendChild(urlCell);

            this.profilesTable.appendChild(newRow);
            i+=1;
        }
    } 
}

// setting DOM Listeners
const currentDocument = new documentSchema();
currentDocument.expandButton.addEventListener("click", function(){
    if(currentDocument.mainTable.hasAttribute("hidden")){
        currentDocument.displayProfiles();
    }else{
        currentDocument.displayDefault();
        chrome.runtime.sendMessage({requestMoreInfo: 'true'});
    }
});

// runtime Messaging
chrome.runtime.sendMessage({requestName: 'true', requestVisas: 'true'},
    function(response){
        currentDocument.companyPlaceholder.innerHTML = response.name;
});
chrome.runtime.onMessage.addListener(
    function(message){
        if(message.operation === "visaEstimation"){
            currentDocument.visasPlaceholder.innerHTML = message.data;
            chrome.runtime.sendMessage({requestRanking: 'true'});
        }else if(message.operation === "rankingEstimation"){
            currentDocument.rankingPlaceholder.innerHTML = message.data;
        }else if(message.operation === "profilesRequest"){
            currentDocument.injectProfiles(message.data);
        }
});
