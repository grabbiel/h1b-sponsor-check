export default class PostingInformation{
    constructor(){
        this.jobDescription = null;
        this.companyName = null;
        this.h1bdata = null;
        this.postIsFriendly = true;
    }
    setCompanyName(cname){
        this.companyName = cname;
    }
    setDescription(jobDescription){
        this.jobDescription = jobDescription;
        this.#classifyDescription();
    }    
    #classifyDescription(){
        if(this.jobDescription.includes('H-1B') || this.jobDescription.includes('U.S.-person') || this.jobDescription.includes("sponsorship") || this.jobDescription.includes("U.S. citizen") || this.jobDescription.includes(" OPT ") || this.jobDescription.includes("eligible to work") || this.jobDescription.includes("work authorization") || this.jobDescription.includes("Unrestricted U.S.")){
            this.postIsFriendly = false; return;
        }else{
            this.postIsFriendly = true;
            return;
        }
    }
    setH1bData = async(data) =>{
        this.h1bdata = data;
    }

}