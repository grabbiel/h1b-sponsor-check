class IndeedPostingsListing{
    constructor(documentHTML){

        this.documentbody = documentHTML;

        this.nameXPATH = ".companyName"; // class storing company names in listing

        this.DOMListing = this.#getNewPostings();
        this.listing = this.#getCompanyNames();

        this.#classifyListing();
    }
    /**
     * Retrieve HTMLDOMCollection of listing company name holders, glossing over unreachable HTML elements
     * @param void
     * @returns HTMLElement[]
    */
    #getNewPostings(){
        var a = Array.from(this.documentbody.querySelectorAll(this.nameXPATH)).map(
            function(posting){
                if(posting===null || posting===undefined) return;
                if(posting.querySelector("svg")) return;
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
        var a = Array.from(this.DOMListing).map(
            function(companyNameHolder, index){
                if(companyNameHolder==null) return;
                return {
                    name: companyNameHolder.innerText.trim(), 
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
    addListingBadge(companyStatus, index){
        new CompanyBadge(this.DOMListing[index], companyStatus);
    }
}