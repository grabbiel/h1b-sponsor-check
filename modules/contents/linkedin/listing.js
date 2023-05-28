class LinkedinPostingsListing{
    constructor(documentHTML, browsePageCode){
        this.maindoc = documentHTML;
        this.nameXPATH = (browsePageCode===1)?".job-card-container__primary-description":"[class*='-container__company-name']";
        this.activepost = null;
        this.#look_for_active_post();
        this.jobListingDOMCollection = this.#get_new_posts();
        this.listing = this.#get_company_nameholders();
        this.#classify_listing();
    }
    #look_for_active_post = async() =>{
        let currentpost = this.maindoc.querySelector("[class*='__list-item--active']");
        if(currentpost!=null && currentpost!=undefined){
            this.activepost = currentpost.querySelector(this.nameXPATH);
        }
    }
    #get_new_posts(){
        var self = this;
        let a = Array.from(this.maindoc.querySelectorAll(this.nameXPATH)).map(
            function(posting, index){
                if(posting===null || posting===undefined) return;
                if(posting.querySelector("svg")) return;
                if(index===0 && self.activepost===null) self.activepost = posting;
                return posting;
            }
        );
        return a;
    }
    #get_company_nameholders(){
        let a = Array.from(this.jobListingDOMCollection).map(
            function(companyName, index){
                if(companyName==null) return;
                return {
                    name: companyName.innerText.trim(), 
                    index: index
                };
        });
        return a;
    }
    #classify_listing = async() =>{
        new Messaging({origin: "content", operation: "submit", data:{
            posts: true,
            content: this.listing
        }});
    }
    addListingBadge(companyStatus, index){
        new CompanyBadge(this.jobListingDOMCollection[index], companyStatus);
    }
    getActiveCompanyName(){
        return this.activepost.innerText.trim();
    }
}