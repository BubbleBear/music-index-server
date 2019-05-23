<template>
  <div id="app">
    <router-view/>
    <div id="loading" v-if="$parent.showLoading">
      <svg viewBox="0 0 38 38" xmlns="http://www.w3.org/2000/svg" stroke="#fff">
        <g fill="none" fill-rule="evenodd">
          <g transform="translate(1 1)" stroke-width="2">
            <circle stroke-opacity=".5" cx="18" cy="18" r="18" />
            <path d="M36 18c0-9.94-8.06-18-18-18">
              <animateTransform attributeName="transform" type="rotate" from="0 18 18" to="360 18 18" dur=".7s"
                repeatCount="indefinite" />
            </path>
          </g>
        </g>
      </svg>
    </div>
  </div>
</template>

<script>
export default {
  name: 'App',
  data () {
    return {
      showLoading: false
    }
  },
  created () {
    window.app = this
  }
}
</script>

<style>
#loading {
  width: 100%;
  height: 100vh;
  position: fixed;
  top: 0;
  left: 0;
  z-index: 100;
  background: rgba(48, 47, 47, 0.7);
}

#loading svg {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  margin: auto;
  width: 60px;
  height: 60px;
}
</style>
