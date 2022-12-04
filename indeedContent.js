var currentBody;
var descriptionParser;
var searchResultPosts;

class HTMLCurrentDocument{
    constructor(documentHTML){
        this.currentVersion = documentHTML;
    }
}
class Indeed{
    constructor(documentBody){
        let mainPane = this.#parsePostingPane(documentBody);
        this.topPane = this.#parseTopPane(mainPane);
        this.jobTitle = this.#parseJobTitle(this.topPane);

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
    #parseTopPane(mainPane){
        let topPane = mainPane.querySelector(":scope > [class*='Header'] > [class]");
        return topPane;
    }
    #parseCompanyName(mainPane){
        let nameAndRating = mainPane.querySelector(":scope > [class*='Header'] > div[class] > div:not([class]) > .jobsearch-CompanyInfoContainer > [class*='jobsearch'] > div > div > [class*='jobsearch']");
        let name = nameAndRating.querySelectorAll(":scope > div")[1].querySelector(":scope > div > a");
        return name;
    }
    #parseJobTitle(topPane){
        let positionTitleContainer = topPane.getElementsByClassName("jobsearch-JobInfoHeader-title-container")[0];
        let positionHeader = positionTitleContainer.querySelector(":scope > h1");
        return positionHeader;
    }
    updateJobTitle(positionClassification){
        const spanSpace = document.createElement("span");
        spanSpace.innerHTML = " ";
        this.jobTitle.appendChild(spanSpace);
        this.jobTitle.appendChild(this.#createSponsorBadge(positionClassification));
    }
    #createSponsorBadge(status){
        const spanElement = document.createElement("span");
        spanElement.style =`
        vertical-align: middle;
        display: inline-block;
        font-size: 40%;
        background-color: #FF2D00;
        line-height: 50%;
        color: white; 
        padding: 1.25% 1.25%; 
        text-align: center; 
        border-radius: 7.5%;
        `;
        if(status){spanElement.style.backgroundColor = "#0FFF00";}
        const anchor = document.createElement("a");
        anchor.href = "";
        //anchor.target = "_blank";
        anchor.innerText = "sponsors";
        spanElement.appendChild(anchor);
        return spanElement;
    }
}
class PostingsListing{
    constructor(documentHTML){
        this.jobListingDOMCollection = documentHTML.getElementsByClassName("companyName");
        this.listing = Array.from(this.jobListingDOMCollection).map(function(companyName, index){
            return {name: companyName.innerText.trim(), index: index};
        });
    }
    addListingBadge(companyStatus, index){
        const spanSpace = document.createElement("span");
        spanSpace.innerHTML = " ";
        if(this.jobListingDOMCollection[index].getElementsByTagName("a").length > 0){
            let innerAnchor = this.jobListingDOMCollection[index].getElementsByTagName("a")[0];
            this.#deleteRedundantElement(innerAnchor);
            innerAnchor.appendChild(spanSpace);
            innerAnchor.appendChild(this.#createSVG(companyStatus));

        }else{
            this.#deleteRedundantElement(this.jobListingDOMCollection[index]);
            this.jobListingDOMCollection[index].appendChild(spanSpace);
            this.jobListingDOMCollection[index].appendChild(this.#createSVG(companyStatus));
        }
    }
    #deleteRedundantElement(domElement){
        if(domElement.hasChildNodes()){
            let spanChildren = domElement.getElementsByTagName("span");
            let svgChildren = domElement.getElementsByTagName("svg");
            if(spanChildren.length > 0){
                Array.from(spanChildren).forEach((spanChild)=>{
                    domElement.removeChild(spanChild);
                });
            }
            if(svgChildren.length > 0){
                Array.from(svgChildren).forEach((svgChild)=>{
                    domElement.removeChild(svgChild);
                });
            }
        }
    }
    #createSVG(status){
        const svg = document.createElementNS("http://www.w3.org/2000/svg","svg");
        svg.style = `
        vertical-align: middle;
        `;
        svg.setAttribute("viewBox","0 0 18 18");
        svg.setAttribute("width","18");
        svg.setAttribute("height","18");
        svg.setAttribute("xmlns","http://www.w3.org/2000/svg");
        svg.appendChild(this.#createPath(status));
        return svg;
    }
    #createPath(status){
        const path = document.createElementNS("http://www.w3.org/2000/svg","path");
        path.style.verticalAlign = "middle";
        if(status){
            path.setAttribute("fill","#0FFF00");
            path.setAttribute("d", "M10.067.87a2.89 2.89 0 0 0-4.134 0l-.622.638-.89-.011a2.89 2.89 0 0 0-2.924 2.924l.01.89-.636.622a2.89 2.89 0 0 0 0 4.134l.637.622-.011.89a2.89 2.89 0 0 0 2.924 2.924l.89-.01.622.636a2.89 2.89 0 0 0 4.134 0l.622-.637.89.011a2.89 2.89 0 0 0 2.924-2.924l-.01-.89.636-.622a2.89 2.89 0 0 0 0-4.134l-.637-.622.011-.89a2.89 2.89 0 0 0-2.924-2.924l-.89.01-.622-.636zm.287 5.984-3 3a.5.5 0 0 1-.708 0l-1.5-1.5a.5.5 0 1 1 .708-.708L7 8.793l2.646-2.647a.5.5 0 0 1 .708.708z");
            return path;
        }
        path.setAttribute("fill","#FF2D00");
        path.setAttribute("d", "M11.46.146A.5.5 0 0 0 11.107 0H4.893a.5.5 0 0 0-.353.146L.146 4.54A.5.5 0 0 0 0 4.893v6.214a.5.5 0 0 0 .146.353l4.394 4.394a.5.5 0 0 0 .353.146h6.214a.5.5 0 0 0 .353-.146l4.394-4.394a.5.5 0 0 0 .146-.353V4.893a.5.5 0 0 0-.146-.353L11.46.146zm-6.106 4.5L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 1 1 .708-.708z");
        return path;
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
                descriptionParser = new Indeed(document.currentVersion);
                searchResultPosts = new PostingsListing(document.currentVersion);
                sendResponse({description: descriptionParser.jobDescription, name: descriptionParser.companyName, posts: searchResultPosts.listing});
            }else if(message.operation === "classifyJobPosting"){
                descriptionParser.updateJobTitle(message.data);
            }else if(message.operation === "classifyJobList"){
                searchResultPosts.addListingBadge(message.data.searchStatus, message.data.index);
            }
        }else{
            sendResponse({operationStatus: "error"});
        }

    }
);
