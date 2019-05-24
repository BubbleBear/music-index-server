// The Vue build version to load with the `import` command
// (runtime-only or standalone) has been set in webpack.base.conf with an alias.
import Vue from 'vue'
import App from './App'
import router from './router'
import axios from 'axios'
Vue.config.productionTip = false

/* eslint-disable no-new */
new Vue({
  el: '#app',
  data () {
    return {
      showLoading: false
    }
  },
  router,
  components: { App },
  template: `<App />`,
  created () {
    axios.interceptors.request.use((config) => {
      this.showLoading = true
      return config
    }, (error) => Promise.reject(error))
    axios.interceptors.response.use((response) => {
      this.showLoading = false
      if (!response.data.success) return alert(response.data.message || '后台出错了请询问技术人员')
      return response.data
    }, (error) => {
      this.showLoading = true
      return Promise.reject(error)
    })
  }
})
