class PostingBadge{
    constructor(position_container, job_classification){
        this.container = position_container;
        this.#clearCache();
        this.#addBadge(job_classification);
    }
    /**
     * Remove span elements if existing
     * @param void
     * @returns void
    */
    #clearCache(){

        if(this.container.querySelector("span") === undefined || 
        this.container.querySelector("span") === null) return;

        Array.from(this.container.querySelectorAll("span")).forEach(
            (spanelement)=>{ this.container.removeChild(spanelement); }
        );
        
    }
    /**
     * Add JS-created badge to HTML DOM structure next to job title
     * @param int company_status
     * @returns void
    */
    #addBadge(dstatus){
        const spanSpace = document.createElement("span");
        spanSpace.innerHTML = " ";
        this.container.appendChild(spanSpace);
        this.container.appendChild(this.#createBadge(dstatus));
    }
    /**
     * Creates badge to inject into HTML DOM structure
     * @param int company_status
     * @returns void
    */
    #createBadge(dstatus){
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
        if(dstatus == 1){spanElement.style.backgroundColor = "#0FFF00";}
        const anchor = document.createElement("a");
        anchor.innerText = "sponsors";
        anchor.title = "More H1B information";
        anchor.addEventListener("click",e=>{
            e.preventDefault();
            window.scrollTo(0,0); // scroll to top
            this.#popup_manager(); // create message window
            return false;
        });
        spanElement.appendChild(anchor);
        return spanElement;
    }
    /**
     * Request sponsoring data for company from background script
     * @param void
     * @returns void
    */
    #popup_manager(){
        new Messaging({origin: "popup", operation: "request", data:{full: true} });
    }    
}