export default class PostingInformation{
    constructor(){
        this.platform = null;
        this.country = null;
        this.jobDescription = null;
        this.companyName = null;
        this.h1bData = null;
        this.postIsFriendly = true;
    }
    setCompanyName(cname){
        this.companyName = cname;
    }
    setDescription(jobDescription){

        this.jobDescription = jobDescription.toLowerCase();
        this.#classifyDescription();

    }
    setPlatform(platform){
        this.platform = platform;
    }
    setCountry(country){
        this.country = country;
    }
    #classifyDescription(){
        if(this.jobDescription.includes('H-1B') || this.jobDescription.includes('U.S.-person') || this.jobDescription.includes("sponsorship") || this.jobDescription.includes("U.S. citizen") || this.jobDescription.includes(" OPT ") || this.jobDescription.includes("eligible to work") || this.jobDescription.includes("work authorization") || this.jobDescription.includes("Unrestricted U.S.")){
            this.postIsFriendly = 0; return;
        }else{
            this.postIsFriendly = 1;
            return;
        }
    }
    setH1bData = async(data) =>{
        this.h1bData = data;
    }

}