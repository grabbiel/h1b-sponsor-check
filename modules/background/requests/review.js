import Requests from "./types.js";
export default class MatchReviewRequest extends Requests{
    constructor(match_name, platform_code, country_code, string_literal){
        super();
        this.company_name = match_name;
        this.platform = platform_code;
        this.country = country_code;
        this.literal_match = string_literal;
        
    }
    runProcess = async() =>{
        this.submitMatchReview(this.company_name, this.platform, this.country, this.literal_match);
    }
}
