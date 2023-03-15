export default class PostingInformation{
    constructor(){
        this.jobDescription = null;
        this.companyName = null;
        this.h1bData = null;
        this.postIsFriendly = true;
    }

    setCompanyName(company_name){

        this.companyName = company_name;

    }
    setDescription(job_description){

        this.jobDescription = job_description.toLowerCase();
        this.#classifyDescription();
        
    }
    #classifyDescription(){
        if(
            this.jobDescription.includes("H-1B") || 
            this.jobDescription.includes("u.s.-person") || 
            this.jobDescription.includes("sponsorship") || 
            this.jobDescription.includes("U.S. citizen") || 
            this.jobDescription.includes(" OPT ") || 
            this.jobDescription.includes("eligible to work") || 
            this.jobDescription.includes("work authorization") || 
            this.jobDescription.includes("unrestricted U.S.")
        )
            this.postIsFriendly = 0;

        else this.postIsFriendly = 1; 
    }
    setH1bData = async(data) =>{

        this.h1bData = data;
        
    }
}