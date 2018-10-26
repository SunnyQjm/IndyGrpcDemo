# IndyGrpcDemo

这是一个基于 grpc 作通信层 实现的HyperLedger Indy 官方文档中Alice获取成绩单示例的Demo

# 使用方法

## 运行demo前准备

- 首先要确保安装了docker、git

``` bash
docker --version
git --version
```

## clone 当前Repo

```bash
git clone https://github.com/SunnyQjm/IndyGrpcDemo.git
```

## 运行测试demo，下面的代码要在 IndyGrpcDemo 项目的根目录下执行

```bash
# 安装所需的依赖库
npm install

# 运行网络测试环境
npm run startNodes
```
上面的代码运行成功后会构建一个四个节点的测试环境，观察控制台输出，看测试节点运行在哪个IP地址

## 运行demo

```bash
export TEST_POOL_IP=上面控制台输出的测试节点运行的IP地址
npm run runAlice
```
