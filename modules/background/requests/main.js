export default class ServerRequest{
    constructor(){
        this.initialRoute = "https://visaspotter.com/phpdocs/"
        this.fullRoute = null;
        this.formData = new FormData();
        this.insertFormData = new FormData();
    }
    setRequest(requestType){
        this.fullRoute = this.initialRoute+requestType+".php";
    }
    async runQuery(){
        return fetch(this.fullRoute, {method: "POST", body: this.formData}).then(
            async(response)=>{
                this.formData = new FormData();
                return response.json().then(
                    (jsonResponse)=>{ return jsonResponse; }
        )});
    }
    async setFormData(...keyvals){
        for(const keyval of keyvals){
            this.formData.append(keyval.key, keyval.value);
        }
    }
}