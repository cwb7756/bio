// pages/course/course.js
const { addToNotebook } = require('../../utils/notebook.js');

Page({
  data: {
    statusBarHeight: 20,
    courseId: '',
    course: null,
    videos: [],
    knowledgePoints: [],
    lessons: [],
    learnedLessonIds: [],
    currentLessonIndex: 0,
    currentVideo: null,
    currentCover: '',
    courseCompleted: false,
    pendingLesson: null,
    loading: true,
    loadError: false
  },

  onLoad(options) {
    const sys = wx.getSystemInfoSync();
    this.setData({
      statusBarHeight: sys.statusBarHeight,
      courseId: (options && options.courseId) || ''
    });
    this.loadDetail();
  },

  loadDetail() {
    if (!this.data.courseId) {
      this.setData({ loading: false, loadError: true });
      return;
    }
    this.setData({ loading: true, loadError: false });
    wx.cloud.callFunction({
      name: 'getCourseDetail',
      data: { courseId: this.data.courseId },
      success: (res) => {
        if (res.result && res.result.code === 0) {
          const { course, videos, knowledgePoints, lessons, learnedLessonIds, courseCompleted } = res.result.data;
          // 课时列表附加已学状态
          const learnedSet = {};
          (learnedLessonIds || []).forEach((id) => { learnedSet[id] = true; });
          const lessonList = (lessons || []).map((l, i) => ({
            ...l,
            no: l.index || i + 1,
            learned: !!learnedSet[l._id]
          }));
          // 默认选中第一个未学课时
          let currentLessonIndex = 0;
          for (let i = 0; i < lessonList.length; i++) {
            if (!lessonList[i].learned) {
              currentLessonIndex = i;
              break;
            }
          }
          const currentVideo = this.pickVideoForLesson(lessonList[currentLessonIndex], videos);
          this.setData({
            course,
            videos,
            knowledgePoints,
            lessons: lessonList,
            learnedLessonIds: learnedLessonIds || [],
            courseCompleted: !!courseCompleted,
            currentLessonIndex,
            currentVideo,
            currentCover: this.pickCover(course, currentVideo),
            loading: false
          });
        } else {
          this.setData({ loading: false, loadError: true });
        }
      },
      fail: (err) => {
        console.error('getCourseDetail error:', err);
        this.setData({ loading: false, loadError: true });
      }
    });
  },

  // 当前视频封面，兜底课程封面
  pickCover(course, video) {
    return (video && video.cover) || (course && course.image) || '';
  },

  // 课时关联视频：取 lesson.videoIds[0] 在课程视频列表中匹配，兜底第一个视频
  pickVideoForLesson(lesson, videos) {
    if (!videos || videos.length === 0) return null;
    const vid = lesson && lesson.videoIds && lesson.videoIds[0];
    if (vid) {
      const found = videos.find((v) => v._id === vid);
      if (found) return found;
    }
    return videos[0];
  },

  // 点击课时：切换播放器到该课时关联视频
  switchLesson(e) {
    const index = e.currentTarget.dataset.index;
    const lesson = this.data.lessons[index];
    const video = this.pickVideoForLesson(lesson, this.data.videos);
    this.setData({
      currentLessonIndex: index,
      currentVideo: video,
      currentCover: this.pickCover(this.data.course, video)
    });
  },

  // 点击播放：跳转 B 站小程序播放
  playCurrent() {
    const v = this.data.currentVideo;
    if (!v) {
      wx.showToast({ title: '暂无视频', icon: 'none' });
      return;
    }
    if (!v.aid || !v.url) {
      wx.showToast({ title: '暂无视频源', icon: 'none' });
      return;
    }
    // 记录待确认课时，从 B 站返回后询问是否看完
    const lesson = this.data.lessons[this.data.currentLessonIndex];
    if (lesson && !lesson.learned) {
      this.setData({
        pendingLesson: { lessonId: lesson._id, title: lesson.title, ts: Date.now() }
      });
    }
    wx.navigateToMiniProgram({
      appId: 'wx7564fd5313d24844',
      path: 'pages/video/video?avid=' + v.aid,
      fail: (err) => {
        // 用户取消跳转不提示
        if (err && err.errMsg && err.errMsg.indexOf('cancel') !== -1) return;
        wx.showToast({ title: '跳转失败，请稍后再试', icon: 'none' });
      }
    });
  },

  // 从 B 站返回：离开超过 15 秒则询问是否看完当前课时
  onShow() {
    const p = this.data.pendingLesson;
    if (!p) return;
    this.setData({ pendingLesson: null });
    if (Date.now() - p.ts < 15000) {
      wx.showToast({ title: '时间小于15秒要认真哦', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '完成学习',
      content: '看完《' + p.title + '》了吗？确认后记录学习进度并奖励小鱼干',
      confirmText: '看完了',
      cancelText: '还没有',
      success: (res) => {
        if (res.confirm) this.completeLesson(p.lessonId);
      }
    });
  },

  // 标记单个课时为已学：写 study_progress + 宠物/时长/打卡联动
  completeLesson(lessonId) {
    wx.showLoading({ title: '记录中...' });
    wx.cloud.callFunction({
      name: 'getCourseDetail',
      data: { action: 'completeLesson', courseId: this.data.courseId, lessonId },
      success: (r) => {
        wx.hideLoading();
        if (r.result && r.result.code === 0) {
          const d = r.result.data;
          if (d.already) {
            wx.showToast({ title: '该课时已记录过', icon: 'none' });
            return;
          }
          const lessons = this.data.lessons.map((l) =>
            l._id === lessonId ? { ...l, learned: true } : l
          );
          this.setData({
            lessons,
            learnedLessonIds: this.data.learnedLessonIds.concat([lessonId]),
            courseCompleted: !!d.courseCompleted
          });
          wx.showToast({ title: '+' + d.fishReward + ' 小鱼干', icon: 'none' });
          this.refreshAchievements();
        } else {
          wx.showToast({ title: (r.result && r.result.msg) || '记录失败', icon: 'none' });
        }
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: '网络异常', icon: 'none' });
      }
    });
  },

  // 静默刷新成就，有新解锁则提示
  refreshAchievements() {
    wx.cloud.callFunction({
      name: 'achievements',
      data: { action: 'refresh' },
      success: (r) => {
        const list = r.result && r.result.newlyUnlocked;
        if (list && list.length > 0) {
          wx.showToast({ title: '解锁成就：' + list[0].name, icon: 'none' });
        }
      }
    });
  },

  // 全屏查看封面
  previewCover() {
    if (!this.data.currentCover) return;
    wx.previewImage({ current: this.data.currentCover, urls: [this.data.currentCover] });
  },

  // 跳考点页（可带 kpId 锚点）
  goKnowledge(e) {
    const kpId = e.currentTarget.dataset.kpid || '';
    let url = '/pages/knowledge/knowledge?courseId=' + this.data.courseId;
    if (kpId) url += '&kpId=' + kpId;
    wx.navigateTo({ url });
  },

  // 标记课程为已学完：写入 study_progress，知识地图将同步点亮
  completeCourse() {
    if (this.data.courseCompleted) {
      wx.showToast({ title: '已学完', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '完成学习',
      content: '确认已学完本课程所有课时？',
      confirmText: '已学完',
      success: (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '记录中...' });
        wx.cloud.callFunction({
          name: 'getCourseDetail',
          data: { action: 'completeCourse', courseId: this.data.courseId },
          success: (r) => {
            wx.hideLoading();
            if (r.result && r.result.code === 0) {
              const lessons = this.data.lessons.map((l) => ({ ...l, learned: true }));
              this.setData({ courseCompleted: true, lessons });
              wx.showToast({ title: '已记录学习进度', icon: 'success' });
              this.refreshAchievements();
            } else {
              wx.showToast({ title: (r.result && r.result.msg) || '记录失败', icon: 'none' });
            }
          },
          fail: () => {
            wx.hideLoading();
            wx.showToast({ title: '网络异常', icon: 'none' });
          }
        });
      }
    });
  },

  goBack() {
    wx.navigateBack();
  },

  // 收录课时到笔记本
  addLessonToNotebook(e) {
    var lessonId = e.currentTarget.dataset.lessonid;
    var title = e.currentTarget.dataset.title;
    var course = this.data.course;
    addToNotebook({
      type: 'course',
      source: 'course',
      refId: lessonId,
      title: title || '课时收录',
      content: course ? (course.title + ' · ' + (course.tag || '')) : '',
      meta: { courseId: this.data.courseId }
    });
  },

  // 分享给好友
  onShareAppMessage() {
    const course = this.data.course;
    return {
      title: course ? course.title || '高中生物课程' : '高中生物课程',
      path: '/pages/course/course?courseId=' + this.data.courseId
    };
  },

  // 分享到朋友圈
  onShareTimeline() {
    const course = this.data.course;
    return {
      title: course ? course.title || '高中生物课程' : '高中生物课程'
    };
  }
});
