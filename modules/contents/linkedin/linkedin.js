var popup;
class LinkedIn{
    constructor(documentBody, currentURL){
        this.jobView = false;
        if(currentURL === 2){this.jobView = true}
        
        let mainPane = this.#parsePostingPane(documentBody);
    
        let topPane = this.#parseTopPane(mainPane);
        this.jobTitle = this.#parseJobTitle(topPane);

        let description = this.#parseJobDescription(mainPane);
        this.jobDescription = description.innerText;
        
        this.nameContainer = this.#parseCompanyName(topPane);
        this.companyName = this.nameContainer.innerText.trim();

        this.status = null;
    }
    #parsePostingPane(documentBody){    
        if(this.jobView){
            return documentBody.querySelector("[role='main']");
        }else{
            let mainParent = documentBody.querySelector("#main");
            let mainPane = mainParent.querySelector("div > .jobs-search__job-details > .jobs-search__job-details--container > .jobs-details > div:not([class]) > div");
            return mainPane;
        }
    }
    #parseJobDescription(mainPane){
        if(this.jobView){
            return mainPane.querySelector("[class*='jobs-description'] > article > div > [class*='content'] > span");
        }else{
            //let jobDescription = mainPane.querySelector(":scope > .jobs-description");
            //let jobDescriptionContent = jobDescription.querySelector(":scope > article").querySelector(":scope > div");
            //return jobDescriptionContent.querySelector(":scope > #job-details").querySelector(":scope > span");
            return mainPane.querySelector("#job-details > span");
        }
    }
    #parseTopPane(mainPane){
        if(this.jobView){
            return mainPane.querySelector("div:not([class]) > div > div > .p5");
        }else{
            return mainPane.querySelectorAll(":scope > div:not([id]) > .jobs-unified-top-card > div")[0];
        }
    }
    #parseCompanyName(topPane){
        if(this.jobView){
            return topPane.querySelector("[class*='company-name'] > a");
        }else{
            return topPane.querySelector("[class*='-card__company-name']");
        }
    }
    #parseJobTitle(topPane){
        if(this.jobView){
            return topPane.querySelector("h1");
        }else{
            let positionHeaderAnchor = topPane.querySelector(":scope > [class^='jobs-unified-top-card__content'] > a");
            positionHeaderAnchor.addEventListener("click", (clickEvent)=>{clickEvent.stopPropagation();});
            return positionHeaderAnchor.querySelector(":scope > [class*='job']");
        }
    }
    updateJobTitle(positionClassification){
        if(this.jobTitle.childNodes.length > 1){
            this.jobTitle.removeChild(this.jobTitle.lastChild);
            this.jobTitle.removeChild(this.jobTitle.lastChild);
        }
        const spanSpace = document.createElement("span");
        spanSpace.innerHTML = " ";
        this.jobTitle.appendChild(spanSpace);
        this.jobTitle.appendChild(this.#createSponsorBadge(positionClassification));
    }
    updateCompanyStatus(companyStatus){
        new PostingBadge(this.nameContainer,companyStatus);
    }
    #createSponsorBadge(status){
        this.status = status;
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
        anchor.innerText = "sponsors";
        anchor.title = "More H1B information";
        anchor.addEventListener("click",e=>{
            e.preventDefault();
            this.#createPopup();
            return false;
        });
        spanElement.appendChild(anchor);
        return spanElement;
    }
    #createPopup(){
        fetch(chrome.runtime.getURL('../../popup/container.html')).then(r => r.text()).then(html =>{
            document.body.firstElementChild.insertAdjacentHTML('afterend',html);
            popup = new PopUp(this.companyName);
        });
    }
}