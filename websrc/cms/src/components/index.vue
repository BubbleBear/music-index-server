<template>
  <div id="index">
<header>数据表格下载</header>
  <div class="main-wrap">
    <div class="left">
      <div>
        <div class="title">曲库详情下载</div>
        <div class="input-wrap">
          <span>公司ID:</span>
          <input type="text" id="c-id" v-model="cId" placeholder="请输入公司ID并点击下载按钮">
        </div>
      </div>
      <button id="dcb" @click="downloadMD" class="download">查询并下载</button>
    </div>
    <div>
      <div>
        <div class="title">下载对应日期下的公司统计数据</div>
        <div class="input-wrap">
          <span>日期:</span>
          <select id="date-select" v-model="dateResult">
            <option value="none">请选择日期</option>
            <option v-for="(date,index) in defaultDateOptions " :key="index" :value="date" v-text="`过去${date}天`"></option>
            <option v-if="additionDateOptions.length" v-for="date in additionDateOptions " :key="date" :value="date" v-text="date"></option>
          </select>
        </div>
      </div>
      <button class="download" id="ddb" @click="downloadDL">查询并下载</button>
    </div>
  </div>
  <header>单曲查询</header>
  <div class="main-wrap column-warp">
    <div>
      <div>
        <div class="input-wrap">
          <span>歌曲名称:</span>
          <input type="text" id="song-name" v-model="trackParams.songName" placeholder="请输入歌曲名称">
        </div>
        <div class="input-wrap">
          <span>歌 手 名 :</span>
          <input type="text" id="artist-name" v-model="trackParams.artistName" placeholder="请输入歌手名称">
        </div>
        <div class="input-wrap">
          <span>专辑名(选填):</span>
          <input type="text" id="album-name" v-model="trackParams.albumName" placeholder="请输入专辑名称">
        </div>
        <div class="result"></div>
      </div>
      <button id="single-track" class="download" @click="getTrack">查询</button>
    </div>
    <div id="track-list-warp" class="table-warp" v-if="showTrackList">
      <div class="song-name" id="song-name-data" style="text-align:center" v-text="trackListInfo.songName"></div>
      <div class="author" id="artist-name-data" style="text-align:center" v-text="trackListInfo.artistName"></div>
      <div class="table" id="track-list" style="width:600px;">
        <ul class="index-warp">
          <li class="table-title">
          </li>
          <li>是否存在</li>
          <li>评论/播放</li>
        </ul>
        <ul v-for="(brand,index) in Object.keys(trackResult)" :key="index">
          <li class="table-title" v-text="trackResult[brand].label || brand"></li>
          <li v-text="trackResult[brand].name ? '✔️' : '❌'"></li>
          <li v-text="trackResult[brand].comments || trackResult[brand].views ? trackResult[brand].comments || trackResult[brand].views : '❌'"></li>
        </ul>
      </div>

    </div>
  </div>
  <div class="model-warp">
    <div class="title">按公司ID创建查询任务</div>
    <div class="main-wrap">
      <div>
        <div>
          <div class="input-wrap">
            <span>公司ID:</span>
            <input type="text" id="create-track-id" placeholder="请输入公司ID" v-model="companyId">
          </div>
        </div>
        <button id="create-track" class="download" @click="createTask">创建查询任务</button>
      </div>
      <div class="common-list-warp">
        <div class="title" id="downloading-count">正在进行的查询总数：{{downloadingList.length}}</div>
        <div class="table" v-if="downloadingList.length" id="downloading-table">
          <ul v-for="(row,index) in downloadingListKeyLabel" :key="index">
            <li class="table-title" v-text="row.label" :style="index === 0 && 'border-left: none'" ></li>
            <li v-for="(item,i) in downloadingList" :key="i" :style="index === 0 && 'border-left: none'" >
              {{row.key && (row.key === 'index' ? i+1 : row.key === 'status' ? '正在下载' : item[row.key])}}
              <button v-if="!row.key" class="cancel" @click="cancelDownloading(item.filename)">取消</button>
            </li>
          </ul>
        </div>
      </div>
    </div>
    <div class="title" style="height:40px;line-height: 40px">已完成公司列表</div>
  <div class="tip" id="file-list-count"
    style="text-align: center;font-size: 14px;color:#999;height:28px;line-height:28px;padding-bottom:10px">总数：{{companyTracks.length}}</div>
  <div style="padding-top:0;" class="main-wrap">
    <div class="common-list-warp " style="padding-top:0" >
      <div class="table" v-if="companyTracks.length" id="file-list" style="width:auto">
        <ul v-for="(row,index) in downloadingListKeyLabel" :key="index" :class="row.className">
          <li class="table-title" v-text="row.label" :style="index === 0 && 'border-left: none'" ></li>
          <li v-for="(item,i) in companyTracks" :key="i" :style="index === 0 && 'border-left: none'" >
            {{row.key && (row.key === 'index' ? i+1 : row.key === 'status' ? '已完成' : item[row.key])}}
            <button v-if="!row.key" class="cancel" @click="downloadFile(item.filename)">下载</button>
          </li>
        </ul>
      </div>
    </div>
  </div>
  </div>
  <div class="model-warp">
    <div class="title" style="height:40px;line-height: 40px">根据文件创建查询</div>
    <div class="main-wrap">
      <div class="upload-model-wrap">
          <div class="upload-btn-wrap">
            <svg class="icon" width="200px" height="200.00px" viewBox="0 0 1024 1024" version="1.1"
              xmlns="http://www.w3.org/2000/svg">
              <path fill="#333333" d="M1024 409.6H614.4V0H409.6v409.6H0v204.8h409.6v409.6h204.8V614.4h409.6z" /></svg>
            <span class="tip">点击上传csv查询文件</span>
            <input type="file" @change="uploadCsv" accept=".csv" id="config-upload">
          </div>
        <div class="upload-btn-wrap" style="margin-top: 10px">
          <svg class="icon" width="200px" height="200.00px" viewBox="0 0 1024 1024" version="1.1"
            xmlns="http://www.w3.org/2000/svg">
          <path fill="#333333" d="M1024 409.6H614.4V0H409.6v409.6H0v204.8h409.6v409.6h204.8V614.4h409.6z" /></svg>
          <span class="tip">点击上传地理位置追加文件</span>
          <input type="file" @change="uploadLocationCsv" accept=".csv" id="config-upload">
        </div>
        <div class="tip">请上传和开发人员确定的文件格式</div>
      </div>
      <div class="common-list-warp">
        <div class="title" id="downloading-count">正在进行的csv查询总数：{{csvDownloadingList.length}}</div>
        <div class="table" v-if="csvDownloadingList.length" id="downloading-table" style="width:auto">
          <ul v-for="(row,index) in downloadingListKeyLabel" :key="index" v-if="!row.hide">
            <li class="table-title" v-text="row.showSubLabel ? row.subLabel :row.label" :style="index === 0 && 'border-left: none'" ></li>
            <li v-for="(item,i) in csvDownloadingList" :key="i" :style="index === 0 && 'border-left: none'" >
              {{row.key && (row.key === 'index' ? i+1 : row.key === 'status' ? '正在下载' : item[row.key])}}
              <button v-if="!row.key" class="cancel" @click="cancelDownloading(item.filename)">取消</button>
            </li>
          </ul>
        </div>
      </div>
    </div>
      <div class="title" style="height:40px;line-height: 40px">已完成文件列表</div>
      <div class="tip" id="file-list-count"
        style="text-align: center;font-size: 14px;color:#999;height:28px;line-height:28px;padding-bottom:10px">总数：{{customScreenshots.length}}</div>
      <div style="padding-top:0;" class="main-wrap">
        <div class="common-list-warp " style="padding-top:0" >
          <div class="table" v-if="customScreenshots.length" id="file-list" style="width:auto">
            <ul v-for="(row,index) in downloadingListKeyLabel" :key="index" v-if="row.key!=='companyName'" :class="row.className" >
              <li class="table-title" v-text="row.showSubLabel ? row.subLabel :row.label" :style="index === 0 && 'border-left: none'" ></li>
              <li v-for="(item,i) in customScreenshots" :key="i" :style="index === 0 && 'border-left: none'" >
                {{row.key && (row.key === 'index' ? i+1 : row.key === 'status' ? '已完成' : item[row.key])}}
                <button v-if="!row.key" class="cancel" @click="downloadFile(item.filename)">下载</button>
              </li>
            </ul>
          </div>
        </div>
      </div>
  </div>
  <div class="config-wrap">
    <div class="title" style="text-align: center">基础配置</div>

    <div class="upload-btn-wrap">
      <svg class="icon" width="200px" height="200.00px" viewBox="0 0 1024 1024" version="1.1"
        xmlns="http://www.w3.org/2000/svg">
        <path fill="#333333" d="M1024 409.6H614.4V0H409.6v409.6H0v204.8h409.6v409.6h204.8V614.4h409.6z" /></svg>
      <span class="tip">点击上传Shadowsocks配置文件</span>
      <input type="file" @change="uploadJson" accept=".json" id="config-upload">
    </div>
    <div class="tip">Shadowsocks配置文件导出方式：Shadowsocks图标右击 -> 服务器 -> 导出服务器全部配置</div>
    <div class="config-list">
      <div class="list-header">
        <div>序号</div>
        <div style="width:200px">代理名称</div>
        <div>端口号</div>
      </div>
      <div class="list-main" id="ss-config-list">
        <ul v-for="i in 3" :key="i" :style="i === 2 ? 'width:200px' : ''">
          <li v-for="(config,index) in ssClientConfigs" :key="index">
            {{ssClientConfigKeys[i-1] === 'index' ? index + 1 : config[ssClientConfigKeys[i-1]]}}
          </li>
        </ul>
      </div>
    </div>
    <div class="title" style="text-align: center">境内代理配置 <p id="push" @click="commonPrompt('push')">追加</p>
    </div>
    <div class="config-list">
      <div class="list-header">
        <div style="width:300px">代理地址</div>
        <div>操作</div>
      </div>
      <div class="list-main" id="domestics-config-list" style="font-size:14px">
        <ul style="width:300px;text-align: left" class="h">
          <li v-if="domestics.length" v-for="(domestic,index) in domestics" :key="index" v-text="domestic"></li>
          <li v-else style="text-align:center;height:24px">无</li>
        </ul>
        <ul class="h">
          <li v-if="domestics.length" v-for="(domestic,index) in domestics" :key="index" style="display:flex">
            <p class="del" @click="commonPrompt('del', index)">删除</p>
            <p class="amend" @click="commonPrompt('change', index)">修改</p>
          </li>
          <li v-else style="text-align:center;height:24px">无需操作</li>
        </ul>
      </div>
    </div>
  </div>
  <div class="placeholder-block"></div>
  </div>
</template>
<script>
import '@/style/style.css'
import service from '@/service.js'
import moment from 'moment'
const HOST = ''
export default {
  name: 'index',
  data () {
    return {
      defaultDateOptions: ['30', '90', '180', '365'],
      additionDateOptions: [],
      cId: '',
      dateResult: 'none',
      trackParams: {songName: '', artistName: '', albumName: ''},
      trackResult: {itunes: {name: ''}, kkbox: {name: ''}, spotify: {name: ''}, youtube: {name: ''}, qq: {name: ''}, netease: {name: '', label: '网易云'}},
      showTrackList: false,
      trackListInfo: {songName: '', artistName: ''},
      downloadingList: [],
      downloadingListKeyLabel: [
        {label: '序号', key: 'index', className: 'index-warp'},
        {label: '公司ID', key: 'filename', subLabel: '文件名', className: 'id-warp', showSubLabel: true},
        {label: '公司名称', key: 'companyName', className: 'id-warp', hide: true},
        {label: '状态', key: 'status', className: 'status-warp'},
        {label: '操作', className: 'other-warp'}
      ],
      completeCompanyList: [],
      companyId: '',
      ssClientConfigs: [],
      ssClientConfigKeys: ['index', 'server', 'server_port'],
      domestics: [],
      companyTracks: [],
      customScreenshots: [],
      csvDownloadingList: []
    }
  },
  mixins: [],
  methods: {
    downloadFile (filename) {
      this.downloadCsv(`/api/v1/download?filename=${filename}`)
    },
    uploadJson (event) {
      const reader = new window.FileReader()
      reader.addEventListener('load', () => this.postSsClient(JSON.parse(reader.result)))
      reader.readAsBinaryString(event.target.files[event.target.files.length - 1])
    },
    downloadMD () {
      if (!this.cId) return window.alert('请输入公司ID')
      this.downloadCsv(`/api/v1/csv/music_index_detail/${this.cId}`)
    },
    downloadCsv (url) {
      location.href = `${HOST}${url}`
    },
    formatTimeHorizon (value) {
      let arr = [30, 90, 180, 365]
      if (arr.indexOf(Number(value)) > -1) {
        return [moment().startOf('day').subtract(value, 'day'), moment().endOf('day')]
      } else return [moment(value), moment(value).endOf('day')]
    },
    downloadDL () {
      if (this.dateResult === 'none') return window.alert('请选择日期')
      let timeHorizon = this.formatTimeHorizon(this.dateResult)
      this.downloadCsv(`/api/v1/csv/company_statistics?start_date=${timeHorizon[0].unix()}&end_date=${timeHorizon[1].unix()}`)
    },
    async uploadCsv (event) {
      let formData = new FormData()
      formData.append('csv', event.target.files[0])
      await service.crateCsvTask(formData)
      this.getDownloadingList()
    },
    async uploadLocationCsv (event) {
      let formData = new FormData()
      formData.append('csv', event.target.files[0])
      await service.uploadLocationCsv(formData)
    },
    async getDateOptions () {
      try {
        const res = await service.getDateOptions()
        this.additionDateOptions = res.dates
      } catch (err) {
        console.error(err)
      }
    },
    async cancelDownloading (filename) {
      try {
        await service.cancelDownloading(filename)
        this.getDownloadingList()
      } catch (err) {
        console.error(err)
      }
    },

    async getDownloadingList () {
      try {
        const res = await service.getDownloadList()
        let downloadingList = []
        let csvDownloadingList = []
        res.data.forEach(val => val.type === '0' ? downloadingList.push(val) : csvDownloadingList.push(val))
        this.downloadingList = downloadingList
        this.csvDownloadingList = csvDownloadingList
      } catch (err) {
        console.error(err)
      }
    },
    async createTask () {
      if (!this.companyId) return window.alert('请输入公司Id后再进行创建')
      try {
        await service.createTask(this.companyId)
        this.companyId = ''
        this.getDownloadingList()
      } catch (err) {
        console.error(err)
      }
    },
    async getTrack () {
      if (!this.trackParams.songName || !this.trackParams.artistName) return window.alert('请输入歌曲名和歌手名后再点击查询')
      try {
        const res = await service.getTrack(this.trackParams)
        for (const key in this.trackListInfo) this.trackListInfo[key] = this.trackParams[key]
        for (const key in this.trackResult) {
          if (res.data[key] && res.data[key].name) {
            this.trackResult[key].comments = ''
            this.trackResult[key].views = ''
            for (const k in this.trackResult[key]) res.data[key][k] && (this.trackResult[key][k] = res.data[key][k])
          }
          this.showTrackList = true
        }
      } catch (err) {
        console.error(err)
      }
    },
    async getFilesList () {
      try {
        const res = await service.getFilesList()
        let companyTracks = []
        let customScreenshots = []
        this.companyTracks = res.data.forEach(val => {
          if (val.type === '0') companyTracks.push(val)
          else customScreenshots.push(val)
        })
        this.companyTracks = companyTracks
        this.customScreenshots = customScreenshots
      } catch (err) {
        console.error(err)
      }
    },
    async getConfig () {
      try {
        const res = await service.getConfig()
        if (res.config.ssClient) this.ssClientConfigs = res.config.ssClient.configs
        this.domestics = res.config.domestics
      } catch (err) {
        console.error(err)
      }
    },
    async postSsClient (body) {
      try {
        await service.postSsClient(body)
        this.getConfig()
      } catch (err) {

      }
    },
    commonPrompt (method, index) {
      const data = window.prompt('请粘贴已复制的代理地址')
      if (data) this.changeDomestics({method, index, data})
    },
    changeDomestics ({method, data, index}) {
      if (method === 'push') this.domestics.push(data)
      else if (method === 'del') this.domestics.splice(index, 1)
      else if (method === 'change') this.domestics[index] = data
      this.postDomestics()
    },
    async postDomestics () {
      try {
        await service.postDomestics(this.domestics)
        this.getConfig()
      } catch (err) {

      }
    }
  },
  mounted () {
    this.getDownloadingList()
    this.getFilesList()
    this.getConfig()
  },
  created () {
    this.getDateOptions()
    window.index = this
  },
  computed: {
  }
}
</script>
<style lang="stylus" scoped>
#index {
  .model-warp {
    padding-top 10px
    border-top 1px solid #f0f0f0
  }
  .upload-model-wrap {
    .upload-btn-wrap {
      width none
      max-width 300px
      height 66px
    }
  }
}
</style>
