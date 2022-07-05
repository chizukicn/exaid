export const paramterTemplate = `<%=  %>`

export const defaultModuleBodyTempalte = `{
	<% for(e of operations){ %>
		/**
		 * @title <%=e.title%>
		 * @description <%=e.description%>
		 */
		<% const body = e.parameters.filter(p=>p.in=='body').map(p=>p.name)[0] %>
		<% const formData = e.parameters.filter(p=>p.in=='formData').map(p=>p.name) %>
		<% const params = e.parameters.filter(p=>p.in=='query').map(p=>p.name) %>

		<% const args = e.parameters.map(p=>p.name+':'+p.type).join(',') %>

		<%=e.name %>(<%= args %>){ 
			<% if(formData.length>0){ %>
				const _formData = new FormData();
				<% for(let p of formData){ %>
					_formData.append('<%=p%>', <%=p%>);
				<% } %>
			<% } %>

			

			return axios.<%= e.method %><<%= e.returnType %>>(\`<%=e.path%>\`
			<% if( e.method=='put' || e.method == 'post' ){ %>
				<% if(body){ %>
					,<%=body%> 
				<% } else if(formData.length>0){ %>
					,_formData
				<% } %>
			<% } %>
			<% if(params.length > 0){ %>
				,{ params: {<%= params.join(',') %> } }
			<% } %>
		)
	},

	<% } %>
 }`

export const defaultModuleHeaderTemplate = `
	import axios from "axios";
	import { <%=imports.join(',')%> } from "./types"
`
export const deafaultModuleFooterTemplate = ``

export const defaultModuleTemplate = `
<%= moduleHeader %>
export default <%= moduleBody %> 
<%= moduleFooter %>
`

export const defaultTypesTemplate = `
<% for(model of models){%>
	/**
	* @title <%=model.title%>
	*/
	export interface <%=model.name%> {
		<% for(prop of model.properties){ %>
			/**
			* @description <%=prop.description%>
			*/
			<%=prop.name%><%=prop.required ? '?' :''%>:<%=prop.type%>
		<% } %>
	}
<% } %>`
