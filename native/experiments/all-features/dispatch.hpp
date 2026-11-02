// Existing request-local worker pool, shared dispatch only; worlds never share TT.
class RequestWorkers {
    std::mutex mutex;std::condition_variable ready;std::queue<std::function<void()>> jobs;std::vector<std::thread> threads;bool stopping=false;
    void close(){{std::lock_guard<std::mutex> lock(mutex);stopping=true;}ready.notify_all();for(auto& thread:threads)if(thread.joinable())thread.join();}
public:
    explicit RequestWorkers(size_t n){try{for(size_t i=0;i<n;i++)threads.emplace_back([this]{for(;;){std::function<void()> job;{std::unique_lock<std::mutex> lock(mutex);ready.wait(lock,[this]{return stopping||!jobs.empty();});if(stopping&&jobs.empty())return;job=std::move(jobs.front());jobs.pop();}job();}});}catch(...){close();throw;}}
    ~RequestWorkers(){close();}
    std::future<void> submit(std::function<void()> f){auto task=std::make_shared<std::packaged_task<void()>>(std::move(f));auto result=task->get_future();{std::lock_guard<std::mutex> lock(mutex);if(stopping)throw std::runtime_error("pool closed");jobs.emplace([task]{(*task)();});}ready.notify_one();return result;}
};
