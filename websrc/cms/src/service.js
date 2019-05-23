import axios from 'axios'
export default {
  getTrack ({ songName, artistName, albumName }) {
    return axios.get('/api/v1/get_track', { params: { song_name: songName, artist_name: artistName, album_name: albumName } })
  },
  postSsClient (body) {
    return axios.post('/api/v1/config/ssClient/json', body)
  },
  getConfig () {
    return axios.get('/api/v1/config')
  },
  postDomestics (domestics) {
    return axios.post('/api/v1/config/domestics/json', domestics)
  },
  cancelDownloading (filename) {
    return axios.get(`/api/v1/cancel_downloading?filename=${filename}`)
  },
  getFilesList () {
    return axios.get('/api/v1/list_files')
  },
  getDownloadList () {
    return axios.get('/api/v1/list_downloading')
  },
  createTask (id) {
    return axios.get(`/api/v1/get_tracks?company_id=${id}`)
  },
  getDateOptions () {
    return axios.get('/api/v1/company_statistics/dates')
  },
  crateCsvTask (file) {
    return axios.post('/api/v1/screenshots', file, { headers: { 'Content-Type': 'multipart/form-data' } })
  }
}
