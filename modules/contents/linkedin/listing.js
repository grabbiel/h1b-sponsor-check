class PostingsListing{
    constructor(documentHTML, browsePageCode){
        const nameXPATH = browsePageCode===1?".job-card-container__primary-description":"[class*='-container__company-name']";
        this.activepost = null;
        let currentpost = documentHTML.querySelector("[class*='__list-item--active']");
        let self = this;
        if(currentpost!=null && currentpost!=undefined){
            this.activepost = currentpost.querySelector(nameXPATH);
        }
        this.jobListingDOMCollection = Array.from(documentHTML.querySelectorAll(nameXPATH)).map(function(posting, index){
            if(posting!=null && posting!=undefined){ 
                if(index===0 && self.activepost===null){
                    self.activepost = posting;
                }
                return posting;
            }
        });
        this.listing = Array.from(this.jobListingDOMCollection).map(function(companyName, index){
            if(companyName!=null){
                return {
                    name: companyName.innerText.trim(), 
                    index: index
                }
            }
        });
        this.#classify_listing();
    }
    addListingBadge(companyStatus, index){
        new CompanyBadge(this.jobListingDOMCollection[index], companyStatus);
    }
    getActiveCompanyName(){
        return this.activepost.innerText.trim();
    }
    #classify_listing = async() =>{
        new Messaging({origin: "content", operation: "submit", data:{
            posts: true,
            content: this.listing
        }});
    }
}