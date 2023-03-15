class LinkedinPostingsListing{
    constructor(documentHTML, browsePageCode){

        this.documentbody = documentHTML;

        this.nameXPATH = (browsePageCode===1)?".job-card-container__primary-description":"[class*='-container__company-name']";

        this.activepost = null; // accessed in case name cannot be retrieved
        this.#lookForActivePost();

        this.DOMListing = this.#getNewPostings();
        this.listing = this.#getCompanyNames();
        this.#classifyListing();
    }
    /**
     * Retrieve the company name from the active element in the listing search panel: used in case the main pane panel name holder is not found
     * @param void
     * @returns void
    */
    #lookForActivePost = async() =>{

        var currentpost = this.documentbody.querySelector("[class*='__list-item--active']");

        if(currentpost!=null && currentpost!=undefined)
            this.activepost = currentpost.querySelector(this.nameXPATH);
    }
    /**
     * Retrieve HTMLDOMCollection of listing company name holders, glossing over unreachable HTML elements
     * @param void
     * @returns HTMLElement[]
    */
    #getNewPostings(){
        var self = this;
        let a = Array.from(this.documentbody.querySelectorAll(this.nameXPATH)).map(
            function(posting, index){
                if(posting===null || posting===undefined) return;
                if(posting.querySelector("svg")) return;
                if(index===0 && self.activepost===null) self.activepost = posting;
                return posting;
            }
        );
        return a;
    }
    /**
     * Retrieve Array of company names and listing index, based on HTMLDomCollection of name holders
     * @param void
     * @returns <String, int>[]
    */
    #getCompanyNames(){
        let a = Array.from(this.DOMListing).map(
            function(company_name, index){
                if(company_name==null) return;
                return {
                    name: company_name.innerText.trim(), 
                    index: index
                };
        });
        return a;
    }
    /**
     * Send listing Array to background script for querying and processing.
     * @param void
     * @returns void
    */
    #classifyListing = async() =>{
        new Messaging({origin: "content", operation: "submit", data:{
            posts: true,
            content: this.listing
        }});
    }
    /**
     * Add badge next to company name at specific index within array.
     * @param int sponsoring_status
     * @returns void
    */
    addListingBadge(company_status, index){
        new CompanyBadge(this.DOMListing[index], company_status);
    }
    getActiveCompanyName(){
        return this.activepost.innerText.trim();
    }

}