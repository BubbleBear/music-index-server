var host = 'http://192.168.11.166:3000'
var domestics = []
function ctrlLoading(isShow) {
  if (isShow) document.getElementById('loading').style.display = 'block'
  else document.getElementById('loading').style.display = 'none'
}
function formatDownloadingTable() {
  document.getElementById('downloading-table').innerHTML = '<ul class="index-warp"><li class="table-title"> 序号</li></ul><ul class="id-warp"><li class="table-title">公司ID</li></ul><ul class="id-warp"><li class="table-title">公司名称</li></ul><ul class="status-warp"><li class="table-title">状态</li></ul><ul class="operation-warp"><li class="table-title"> 操作</li></ul>'
}
function formatTrackList() {
  document.getElementById('track-list').innerHTML = '<ul class="index-warp"><li class="table-title"></li><li>评论/播放</li><li>是否存在</li></ul><ul><li class="table-title">itunes</li><li>❌</li></ul><ul><li class="table-title">kkbox</li><li>❌</li></ul><ul><li class="table-title">spotify</li><li>❌</li></ul><ul><li class="table-title">youtube</li></ul><ul><li class="table-title">qq</li></ul><ul><li class="table-title">网易云</li></ul>'
}
function getConfig() {
  ctrlLoading(true)
  window.axios.get(host + '/api/v1/config').then(function (res) {
    createSsClientTable(res.data.config.ssClient.configs)
    domestics = res.data.config.domestics
    createDomesticsTable()
    ctrlLoading(false)
  }).catch(function () {
    ctrlLoading(false)
  })
}
function postDomestics() {
  ctrlLoading(true)
  window.axios.post(host + '/api/v1/config/domestics/json', domestics).then(function (res) {
    getConfig()
  }).catch(function () {
    ctrlLoading(false)
  })
}
document.getElementById('push').onclick = function () {
  var r = window.prompt('请粘贴已复制的代理地址')
  if (r) {
    domestics.push(r)
    postDomestics()
  }
}

getConfig()
function cancelDownloading(id) {
  ctrlLoading(true)
  window.axios.get(host + '/api/v1/cancel_downloading?company_id=' + id).then(function () {
    ctrlLoading(false)
    window.alert('取消成功')
    getDownloadList()
    getFileList()
  }).catch(function (err) {
    ctrlLoading(false)
    console.log(err)
  })
}

function getFileList() {
  window.axios.get(host + '/api/v1/list_files').then(res => {
    document.getElementById('file-list-count').innerHTML = '总数:' + res.data.data.length
    if (res.data.data.length) {
      var fileList = document.getElementById('file-list')
      document.getElementById('file-list').innerHTML = '<ul class="index-warp"><li class="table-title">序号</li></ul><ul class="id-warp"><li class="table-title">公司ID</li></ul><ul class="name-warp"><li class="table-title">公司名称</li></ul><ul class="status-warp"><li class="table-title">状态</li></ul><ul class="other-warp"><li class="table-title">操作</li></ul>'
      res.data.data.forEach(function (value, i) {
        var index = document.createElement('li')
        var id = document.createElement('li')
        var name = document.createElement('li')
        var downloadWarp = document.createElement('li')
        var download = document.createElement('a')
        index.innerHTML = i + 1
        id.innerHTML = value.company_id
        name.innerHTML = value.name
        download.href = host + '/api/v1/download?filename=' + value.company_id
        download.innerHTML = '下载'
        downloadWarp.append(download)
        fileList.children[0].append(index)
        fileList.children[1].append(id)
        fileList.children[2].append(name)
        fileList.children[3].innerHTML += ('<li>已完成</li>')
        fileList.children[4].append(downloadWarp)
      })
    } else document.getElementById('file-list').style.display = 'none'
  }).catch(function (err) {
    console.log(err)
  })
}
function creatTrackList(data) {
  formatTrackList()
  var table = document.getElementById('track-list')
  document.getElementById('track-list-warp').style.display = 'block'
  table.children[1].innerHTML += (data.itunes && data.itunes.name ? '<li>✔️</li>' : '<li>❌</li>')
  table.children[2].innerHTML += (data.kkbox && data.kkbox.name ? '<li>✔️</li>' : '<li>❌</li>')
  table.children[3].innerHTML += (data.spotify && data.spotify.name ? '<li>✔️</li>' : '<li>❌</li>')
  table.children[4].innerHTML += (data.youtube && data.youtube.name ? '<li>' + data.youtube.views + '</li><li>✔️</li>' : '<li>❌</li><li>❌</li>')
  table.children[5].innerHTML += (data.qq && data.qq.name ? '<li>' + data.qq.comments + '</li><li>✔️</li>' : '<li>❌</li><li>❌</li>')
  table.children[6].innerHTML += (data.netease && data.netease.name ? '<li>' + data.netease.comments + '</li><li>✔️</li>' : '<li>❌</li><li>❌</li>')
}
function getDownloadList() {
  ctrlLoading(true)
  window.axios.get(host + '/api/v1/list_downloading').then(res => {
    document.getElementById('downloading-count').innerHTML = '正在进行的查询总数:' + res.data.data.length
    if (res.data.data.length) {
      formatDownloadingTable()
      document.getElementById('downloading-table').style.display = 'flex'
      res.data.data.forEach(function (value, i) {
        var downloadingTable = document.getElementById('downloading-table')
        var index = document.createElement('li')
        var name = document.createElement('li')
        index.innerHTML = i + 1
        name.innerHTML = value.name
        var id = document.createElement('li')
        var buttonLi = document.createElement('li')
        var button = document.createElement('button')
        button.innerHTML = '取消'
        button.onclick = cancelDownloading.bind(this, value.company_id)
        buttonLi.append(button)
        id.innerHTML = value.company_id
        downloadingTable.children[0].append(index)
        downloadingTable.children[1].append(id)
        downloadingTable.children[2].append(name)
        downloadingTable.children[3].innerHTML += '<li>下载中</li>'
        downloadingTable.children[4].append(buttonLi)
      })
    } else document.getElementById('downloading-table').style.display = 'none'
    ctrlLoading(false)
  }).catch(function (err) {
    ctrlLoading(false)
    console.log(err)
  })
}
function createTask(id) {
  ctrlLoading(true)
  var url = host + '/api/v1/get_tracks?company_id=' + id
  if (document.getElementById('screenshot').checked) url += '&screenshot=true'
  window.axios.get(url).then(function (res) {
    ctrlLoading(false)
    document.getElementById('create-track-id').value = ''
    getDownloadList()
    getFileList()
  }).catch((err) => {
    ctrlLoading(false)
    console.log(err)
  })
}
function getDateOptions() {
  ctrlLoading(true)
  window.axios.get(host + '/api/v1/company_statistics/dates').then(res => {
    ctrlLoading(false)
    res.data.dates.forEach(function (data) {
      var option = document.createElement('option')
      console.log(option)
      option.value = option.innerText = data
      document.getElementById('date-select').append(option)
    })
  }).catch(err => {
    ctrlLoading(false)
    if (err.msg) window.alert(err.msg)
    else window.alert('获取时间列表失败')
  })
}
getDateOptions()
getFileList()
getDownloadList()
function downloadCsv(url) {
  var a = document.createElement('a')
  a.href = url
  a.click()
}
function downloadMD() {
  var ipt = document.getElementById('c-id')
  if (!ipt.value) return window.alert('请输入公司ID')
  ctrlLoading(true)
  downloadCsv('/api/v1/csv/music_index_detail/' + ipt.value)
  ipt.value = ''
  ctrlLoading(false)
}
function formatTimeHorizon(value) {
  var arr = [30, 90, 180, 365]
  if (arr.indexOf(Number(value)) > -1) {
    return [window.moment().startOf('day').subtract(value, 'day'), window.moment().endOf('day')]
  } else return [window.moment(value), window.moment(value).endOf('day')]
}
function downloadDL() {
  if (document.getElementById('date-select').value === 'none') return window.alert('请选择日期')
  var timeHorizon = formatTimeHorizon(document.getElementById('date-select').value)
  ctrlLoading(true)
  downloadCsv('/api/v1/csv/company_statistics?start_date=' + timeHorizon[0].unix() + '&end_date=' + timeHorizon[1].unix())
  ctrlLoading(false)
}
document.getElementById('dcb').onclick = downloadMD
document.getElementById('ddb').onclick = downloadDL

function getTrack(songName, artistName, albumName) {
  ctrlLoading(true)
  window.axios.get('/api/v1/get_track', { params: { song_name: songName, artist_name: artistName, album_name: albumName } }).then(function (res) {
    ctrlLoading(false)
    creatTrackList(res.data.data)
    document.getElementById('song-name-data').innerHTML = songName
    document.getElementById('artist-name-data').innerHTML = '作者：' + artistName
  }).catch(function (err) {
    console.log(err)
    ctrlLoading(false)
  })
}
document.getElementById('create-track').onclick = function () {
  if (document.getElementById('create-track-id').value) return createTask(document.getElementById('create-track-id').value)
  else window.alert('请输入公司ID')
}

document.getElementById('single-track').onclick = function () {
  getTrack(document.querySelector('#song-name').value, document.querySelector('#artist-name').value, document.querySelector('#album-name').value)
}

function postSsClient(body) {
  window.axios.post(host + '/api/v1/config/ssClient/json', body).then(function (res) {
    ctrlLoading(false)
    getConfig()
  }).catch(function () {
    ctrlLoading(false)
  })
}
function createSsClientTable(ssClientList) {
  var ssList = document.getElementById('ss-config-list')
  var innerHTMLArr = ['', '', '']
  ssClientList.forEach(function (value, index) {
    innerHTMLArr[0] += '<li>' + (index + 1) + '</li>'
    innerHTMLArr[1] += '<li>' + (value.server) + '</li>'
    innerHTMLArr[2] += '<li>' + (value.server_port) + '</li>'
  })
  innerHTMLArr.forEach(function (val, i) { ssList.children[i].innerHTML = val })
}

function createDomesticsTable() {
  var domesticsList = document.getElementById('domestics-config-list')
  domesticsList.children[1].innerHTML = ''
  domesticsList.children[0].innerHTML = ''
  var innerHTML = ''
  if (domestics.length) {
    domestics.forEach(function (value, index) {
      var del = document.createElement('p')
      del.innerHTML = '删除'
      del.className = 'del'
      var amend = document.createElement('p')
      amend.innerHTML = '修改'
      amend.className = 'amend'
      amend.onclick = function () {
        var r = window.prompt('请粘贴已复制的代理地址')
        if (r) {
          domestics[index] = r
          postDomestics()
        }
      }
      del.onclick = function (params) {
        var r = window.confirm('请再次确认')
        if (r) {
          domestics.splice(index, 1)
          postDomestics()
        }
      }
      var li = document.createElement('li')
      li.style = 'display:flex;'
      li.append(amend)
      li.append(del)
      domesticsList.children[1].append(li)
      innerHTML += '<li>' + value + '</li>'
    })
    domesticsList.children[0].innerHTML = innerHTML
  } else {
    domesticsList.children[0].innerHTML = '无'
    domesticsList.children[0].style = 'text-align:center;width:300px'
    domesticsList.children[1].innerHTML = '无'
  }
}

document.getElementById('config-upload').onchange = function (event) {
  console.log(this.files[0])
  const reader = new window.FileReader()
  reader.addEventListener('load', function () {
    ctrlLoading(true)
    postSsClient(JSON.parse(reader.result))
  })
  reader.readAsBinaryString(this.files[0])
}
