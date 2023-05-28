class IndeedPostingsListing{
    constructor(documentHTML){
        this.documentbody = documentHTML;
        this.nameXPATH = ".companyName";
        this.DOMListing = this.#get_new_posts();
        this.listing = this.#get_company_names();
        this.#classify_listing();
    }
    #get_new_posts(){
        var a = Array.from(this.documentbody.querySelectorAll(this.nameXPATH)).map(
            function(posting){
                if(posting===null || posting===undefined) return;
                if(posting.querySelector("svg")) return;
                return posting;
            }
        );
        return a;
    }
    #get_company_names(){
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
    #classify_listing = async() =>{
        new Messaging({origin: "content", operation: "submit", data:{
            posts: true,
            content: this.listing
        }});
    }
    addListingBadge(companyStatus, index){
        new CompanyBadge(this.DOMListing[index], companyStatus);
    }
}