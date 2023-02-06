import Requests from "./types.js";
export default class MatchRequest extends Requests{
    constructor(company_name){
        super();
        this.json_response = null;
        this.string_literal = null;
        this.match_found = false;
        this.name_array = this.#splitCompanyName(company_name);
        this.arr_len = this.name_array.length;
    }
    #splitCompanyName(company_name){
        return company_name.includes(" ")?company_name.split(" "):[company_name];
    }
    #run_query = async (cutoff) =>{
        if(this.arr_len === cutoff){return;}
        else{
            await this.findCompanyMatch(this.name_array.slice(0, this.arr_len - cutoff).join(" ")).then((query_outcome)=>{
                if(query_outcome===true){
                    return;
                }else{
                    return this.#run_query(cutoff+1);
                }
            });
        }
    }
    matching = async() => {
        await this.#run_query(0).finally(()=>{
            if(this.json_temp!=undefined && this.json_temp!=null && this.json_temp.length > 0){
                this.json_response = this.json_temp;
                this.string_literal = this.string_temp;
                this.match_found = true;
                this.clearCache();
            }else{
                this.match_found = false;
            }
        });
    }
}
