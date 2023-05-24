class GeneralParsingWorker{
    constructor(){
        this.documentbody = null;
        this.searchresults = null;
        this.jobposting = null;
    }
    clear_search_cache(){
        this.searchresults = null;
    }
    add_listing_badge = async (companyStatus, index) =>{
        this.searchresults.addListingBadge(companyStatus, index);
    }
    get_listing_active_company_name(){
        return this.searchresults.getActiveCompanyName();
    }
    classify_posting_company(companyStatus){
        this.jobposting.classify_company(companyStatus);
    }
    classify_posting_position(positionStatus){
        this.jobposting.classify_position(positionStatus);
    }
}