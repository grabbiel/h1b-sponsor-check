import { postingBadgeFromDescription } from "./listing-cutover.js";

export default class PostingInformation{
    constructor(){
        this.platform = null;
        this.country = null;
        this.jobDescription = null;
        this.companyName = null;
        this.h1bData = null;
        this.postIsFriendly = 1;
        this.languageBadge = { mark: "sponsor", label: "Sponsor" };
        this.companyBadge = null;
    }
    setCompanyName(cname){
        this.companyName = cname;
    }
    setDescription(jobDescription){
        this.jobDescription = jobDescription;
        this.languageBadge = postingBadgeFromDescription(jobDescription);
        this.postIsFriendly = this.languageBadge.mark === "sponsor" ? 1 : 0;
    }
    setPlatform(platform){
        this.platform = platform;
    }
    setCountry(country){
        this.country = country;
    }
    setCompanyBadge(badge){
        this.companyBadge = badge;
    }
    setH1bData = async(data) =>{
        this.h1bData = data;
    }

}
