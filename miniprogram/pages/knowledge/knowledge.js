// pages/knowledge/knowledge.js
Page({
  data: {
    statusBarHeight: 20,
    title: '细胞的结构',
    bookmarked: false,
    knowledgePoints: [
      {
        icon: 'ic-dna',
        badgeBg: 'o',
        title: '细胞核',
        desc: '细胞的"控制中心"，内含染色质（DNA+蛋白质），是遗传信息库，控制细胞的代谢与遗传。',
        exam: '常考：核孔实现核质间大分子运输'
      },
      {
        icon: 'ic-bolt',
        badgeBg: 'y',
        title: '线粒体',
        desc: '有氧呼吸的主要场所，细胞的"动力车间"；内膜向内折叠成嵴，扩大附着酶的面积。',
        exam: '常考：有氧呼吸第二、三阶段场所'
      },
      {
        icon: 'ic-leaf',
        badgeBg: '',
        title: '叶绿体',
        desc: '光合作用的场所，含叶绿素与类胡萝卜素；类囊体堆叠成基粒，是光反应的场所。',
        exam: '常考：光反应 vs 暗反应 物质与能量变化'
      }
    ]
  },

  onLoad() {
    const sys = wx.getSystemInfoSync();
    this.setData({ statusBarHeight: sys.statusBarHeight });
  },

  goBack() {
    wx.navigateBack();
  },

  toggleBookmark() {
    this.setData({ bookmarked: !this.data.bookmarked });
    wx.showToast({
      title: this.data.bookmarked ? '已收藏' : '已取消收藏',
      icon: 'none'
    });
  },

  addToCards() {
    wx.showToast({ title: '已加入速记卡', icon: 'none' });
  },

  askAI() {
    wx.showToast({ title: 'AI老师讲解中...', icon: 'none' });
  },

  goCompare() {
    wx.showToast({ title: '对比表即将上线', icon: 'none' });
  }
});
